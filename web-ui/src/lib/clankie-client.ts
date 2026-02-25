/**
 * High-level clankie RPC client built on top of WebSocketClient.
 * Implements the protocol defined in clankie's src/channels/web.ts
 */

import type {
	AgentSessionEvent,
	AuthEvent,
	AuthProvider,
	InboundWebMessage,
	Message,
	ModelInfo,
	OutboundWebMessage,
	RpcCommand,
	RpcResponse,
	SessionState,
	ThinkingLevel,
} from "./types";
import { type ConnectionState, WebSocketClient } from "./ws-client";

export interface ClankieClientOptions {
	url: string;
	authToken: string;
	onEvent: (sessionId: string, event: AgentSessionEvent | RpcResponse) => void;
	onAuthEvent: (event: AuthEvent) => void;
	onStateChange: (state: ConnectionState, error?: string) => void;
}

export class ClankieClient {
	private ws: WebSocketClient;
	private options: ClankieClientOptions;
	private pendingRequests = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
	private requestIdCounter = 0;

	constructor(options: ClankieClientOptions) {
		this.options = options;
		this.ws = new WebSocketClient({
			url: options.url,
			authToken: options.authToken,
			onMessage: (data) => this.handleMessage(data as OutboundWebMessage),
			onStateChange: options.onStateChange,
		});
	}

	connect(): void {
		this.ws.connect();
	}

	disconnect(): void {
		this.ws.disconnect();
		// Reject all pending requests
		for (const [id, pending] of this.pendingRequests.entries()) {
			pending.reject(new Error("Connection closed"));
			this.pendingRequests.delete(id);
		}
	}

	getConnectionState(): ConnectionState {
		return this.ws.getState();
	}

	// ─── RPC Methods ───────────────────────────────────────────────────────────

	async newSession(parentSession?: string): Promise<{ sessionId: string; cancelled: boolean }> {
		const response = await this.sendCommand({ type: "new_session", parentSession });
		return response as { sessionId: string; cancelled: boolean };
	}

	async listSessions(): Promise<{
		sessions: Array<{ sessionId: string; name?: string; model?: ModelInfo; messageCount: number }>;
	}> {
		const response = await this.sendCommand({ type: "list_sessions" });
		return response as {
			sessions: Array<{ sessionId: string; name?: string; model?: ModelInfo; messageCount: number }>;
		};
	}

	async prompt(sessionId: string, message: string): Promise<void> {
		await this.sendCommand({ type: "prompt", message }, sessionId);
	}

	async steer(sessionId: string, message: string): Promise<void> {
		await this.sendCommand({ type: "steer", message }, sessionId);
	}

	async followUp(sessionId: string, message: string): Promise<void> {
		await this.sendCommand({ type: "follow_up", message }, sessionId);
	}

	async abort(sessionId: string): Promise<void> {
		await this.sendCommand({ type: "abort" }, sessionId);
	}

	async getState(sessionId: string): Promise<SessionState> {
		const response = await this.sendCommand({ type: "get_state" }, sessionId);
		return response as SessionState;
	}

	async getMessages(sessionId: string): Promise<{ messages: Message[] }> {
		const response = await this.sendCommand({ type: "get_messages" }, sessionId);
		return response as { messages: Message[] };
	}

	async setModel(sessionId: string, provider: string, modelId: string): Promise<ModelInfo> {
		const response = await this.sendCommand({ type: "set_model", provider, modelId }, sessionId);
		return response as ModelInfo;
	}

	async cycleModel(sessionId: string): Promise<ModelInfo | null> {
		const response = await this.sendCommand({ type: "cycle_model" }, sessionId);
		return response as ModelInfo | null;
	}

	async getAvailableModels(sessionId: string): Promise<{ models: ModelInfo[] }> {
		const response = await this.sendCommand({ type: "get_available_models" }, sessionId);
		return response as { models: ModelInfo[] };
	}

	async setThinkingLevel(sessionId: string, level: ThinkingLevel): Promise<void> {
		await this.sendCommand({ type: "set_thinking_level", level }, sessionId);
	}

	async cycleThinkingLevel(sessionId: string): Promise<{ level: ThinkingLevel } | null> {
		const response = await this.sendCommand({ type: "cycle_thinking_level" }, sessionId);
		return response as { level: ThinkingLevel } | null;
	}

	async compact(sessionId: string, customInstructions?: string): Promise<unknown> {
		const response = await this.sendCommand({ type: "compact", customInstructions }, sessionId);
		return response;
	}

	async getSessionStats(sessionId: string): Promise<unknown> {
		const response = await this.sendCommand({ type: "get_session_stats" }, sessionId);
		return response;
	}

	// ─── Auth Methods ──────────────────────────────────────────────────────────

	async getAuthProviders(): Promise<{ providers: AuthProvider[] }> {
		const response = await this.sendCommand({ type: "get_auth_providers" });
		return response as { providers: AuthProvider[] };
	}

	async authLogin(providerId: string): Promise<{ loginFlowId: string }> {
		const response = await this.sendCommand({ type: "auth_login", providerId });
		return response as { loginFlowId: string };
	}

	async authSetApiKey(providerId: string, apiKey: string): Promise<void> {
		await this.sendCommand({ type: "auth_set_api_key", providerId, apiKey });
	}

	authLoginInput(loginFlowId: string, value: string): void {
		// Fire-and-forget, no response expected
		const message: InboundWebMessage = {
			command: { type: "auth_login_input", loginFlowId, value },
		};
		this.ws.send(message);
	}

	authLoginCancel(loginFlowId: string): void {
		// Fire-and-forget, no response expected
		const message: InboundWebMessage = {
			command: { type: "auth_login_cancel", loginFlowId },
		};
		this.ws.send(message);
	}

	async authLogout(providerId: string): Promise<void> {
		await this.sendCommand({ type: "auth_logout", providerId });
	}

	// ─── Internal ──────────────────────────────────────────────────────────────

	private handleMessage(message: OutboundWebMessage): void {
		const { sessionId, event } = message;

		// Check if it's a response to a pending request
		if (event.type === "response" && event.id) {
			const pending = this.pendingRequests.get(event.id);
			if (pending) {
				this.pendingRequests.delete(event.id);
				if (event.success) {
					pending.resolve(event.data);
				} else {
					pending.reject(new Error(event.error));
				}
				return;
			}
		}

		// Check if it's an auth event (sessionId === "_auth")
		if (sessionId === "_auth" && event.type === "auth_event") {
			this.options.onAuthEvent(event);
			return;
		}

		// Otherwise, it's a session event - forward to the event handler
		this.options.onEvent(sessionId, event);
	}

	private async sendCommand(command: RpcCommand, sessionId?: string): Promise<unknown> {
		if (this.getConnectionState() !== "connected") {
			throw new Error("WebSocket is not connected");
		}

		const id = `req-${++this.requestIdCounter}`;
		const message: InboundWebMessage = {
			sessionId,
			command: { ...command, id },
		};

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.ws.send(message);

			// Timeout after 30 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error("Request timeout"));
				}
			}, 30000);
		});
	}
}

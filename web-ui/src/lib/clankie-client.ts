/**
 * High-level clankie RPC client built on top of WebSocketClient.
 * Implements the protocol defined in clankie's src/channels/web.ts
 */

import type {
	AgentSessionEvent,
	AuthEvent,
	AuthProvider,
	ImageContent,
	InboundWebMessage,
	Message,
	ModelInfo,
	OutboundWebMessage,
	RpcCommand,
	RpcResponse,
	SessionState,
	ThinkingLevel,
} from "./types";
import type { ConnectionState } from "./ws-client";
import { WebSocketClient } from "./ws-client";

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
			onMessage: (data) => this.handleMessage(data as OutboundWebMessage | RpcResponse),
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
		const response = await this.sendCommand({
			type: "new_session",
			parentSession,
		});
		console.log("[clankie-client] newSession response:", response);
		return response as { sessionId: string; cancelled: boolean };
	}

	async listSessions(): Promise<{
		sessions: Array<{ sessionId: string; title?: string; messageCount: number }>;
	}> {
		const response = await this.sendCommand({ type: "list_sessions" });
		return response as {
			sessions: Array<{
				sessionId: string;
				title?: string;
				messageCount: number;
			}>;
		};
	}

	async prompt(sessionId: string, message: string, images?: Array<ImageContent>): Promise<void> {
		await this.sendCommand({ type: "prompt", message, images }, sessionId);
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

	async uploadAttachment(
		sessionId: string,
		fileName: string,
		data: string,
		mimeType: string,
	): Promise<{ path: string; fileName: string }> {
		const response = await this.sendCommand({ type: "upload_attachment", fileName, data, mimeType }, sessionId);
		return response as { path: string; fileName: string };
	}

	async getState(sessionId: string): Promise<SessionState> {
		const response = await this.sendCommand({ type: "get_state" }, sessionId);
		return response as SessionState;
	}

	async getMessages(sessionId: string): Promise<{ messages: Array<Message> }> {
		const response = await this.sendCommand({ type: "get_messages" }, sessionId);
		return response as { messages: Array<Message> };
	}

	async setModel(sessionId: string, provider: string, modelId: string): Promise<ModelInfo> {
		const response = await this.sendCommand({ type: "set_model", provider, modelId }, sessionId);
		return response as ModelInfo;
	}

	async cycleModel(sessionId: string): Promise<ModelInfo | null> {
		const response = await this.sendCommand({ type: "cycle_model" }, sessionId);
		return response as ModelInfo | null;
	}

	async getAvailableModels(sessionId: string): Promise<{ models: Array<ModelInfo> }> {
		const response = await this.sendCommand({ type: "get_available_models" }, sessionId);
		return response as { models: Array<ModelInfo> };
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

	async getAuthProviders(): Promise<{ providers: Array<AuthProvider> }> {
		const response = await this.sendCommand({ type: "get_auth_providers" });
		return response as { providers: Array<AuthProvider> };
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

	// ─── Extensions & Skills ───────────────────────────────────────────────────

	async getExtensions(sessionId: string): Promise<{
		extensions: Array<{
			path: string;
			resolvedPath: string;
			tools: Array<string>;
			commands: Array<string>;
			flags: Array<string>;
			shortcuts: Array<string>;
		}>;
		errors: Array<{ path: string; error: string }>;
	}> {
		const response = await this.sendCommand({ type: "get_extensions" }, sessionId);
		return response as {
			extensions: Array<{
				path: string;
				resolvedPath: string;
				tools: Array<string>;
				commands: Array<string>;
				flags: Array<string>;
				shortcuts: Array<string>;
			}>;
			errors: Array<{ path: string; error: string }>;
		};
	}

	async getSkills(sessionId: string): Promise<{
		skills: Array<{
			name: string;
			description: string;
			filePath: string;
			baseDir: string;
			source: string;
			disableModelInvocation: boolean;
		}>;
		diagnostics: Array<{ type: string; message: string; path?: string }>;
	}> {
		const response = await this.sendCommand({ type: "get_skills" }, sessionId);
		return response as {
			skills: Array<{
				name: string;
				description: string;
				filePath: string;
				baseDir: string;
				source: string;
				disableModelInvocation: boolean;
			}>;
			diagnostics: Array<{ type: string; message: string; path?: string }>;
		};
	}

	async installPackage(
		sessionId: string,
		source: string,
		local?: boolean,
	): Promise<{ output: string; exitCode: number }> {
		const response = await this.sendCommand({ type: "install_package", source, local }, sessionId);
		return response as { output: string; exitCode: number };
	}

	async reload(sessionId: string): Promise<void> {
		await this.sendCommand({ type: "reload" }, sessionId);
	}

	// ─── Internal ──────────────────────────────────────────────────────────────

	private handleMessage(message: OutboundWebMessage | RpcResponse): void {
		// Handle raw RpcResponse (for commands without sessionId like list_sessions)
		if ("type" in message && message.type === "response" && "id" in message) {
			const response = message;
			if (!response.id) return; // Skip responses without id
			const pending = this.pendingRequests.get(response.id);
			if (pending) {
				this.pendingRequests.delete(response.id);
				if (response.success) {
					pending.resolve(response.data);
				} else {
					pending.reject(new Error(response.error));
				}
				return;
			}
			// If no pending request, ignore
			return;
		}

		// Handle wrapped OutboundWebMessage (for commands with sessionId)
		if ("sessionId" in message && "event" in message) {
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
			// Filter out auth events (type narrowing)
			if (event.type !== "auth_event") {
				this.options.onEvent(sessionId, event);
			}
			return;
		}

		// Unknown message format
		console.warn("[clankie-client] Unknown message format:", message);
	}

	private async sendCommand(command: RpcCommand, sessionId?: string): Promise<unknown> {
		if (this.getConnectionState() !== "connected") {
			throw new Error("WebSocket is not connected");
		}

		const id = `req-${++this.requestIdCounter}`;
		const message: InboundWebMessage = {
			...(sessionId !== undefined && { sessionId }),
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

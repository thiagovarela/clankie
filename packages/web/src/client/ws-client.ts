/**
 * WebSocket client for server communication
 *
 * Handles connection lifecycle, authentication, and typed message protocol.
 */

export interface WsStateMessage {
	type: "state";
	sessionName: string;
	state: {
		systemPrompt: string;
		model: {
			provider: string;
			id: string;
			name: string;
		} | null;
		thinkingLevel: string;
		tools: Array<{
			name: string;
			description: string;
			label: string;
			parameters: unknown;
		}>;
		messages: unknown[];
		isStreaming: boolean;
		streamMessage: unknown | null;
		pendingToolCalls: string[];
		error?: unknown;
	};
}

export interface WsEventMessage {
	type: "event";
	sessionName: string;
	event: {
		type: string;
		[key: string]: unknown;
	};
	state: WsStateMessage["state"];
}

export interface WsReadyMessage {
	type: "ready";
	sessionName: string;
	sessions: string[];
	persona?: {
		name: string;
	};
}

export interface WsResponseMessage {
	type: "response";
	requestId?: string;
	ok: boolean;
	error?: string;
	[key: string]: unknown;
}

export type WsIncomingMessage = WsStateMessage | WsEventMessage | WsReadyMessage | WsResponseMessage;

export interface WsPromptCommand {
	type: "prompt";
	requestId?: string;
	text: string;
	uploadIds?: string[];
}

export interface WsAbortCommand {
	type: "abort";
	requestId?: string;
}

export interface WsSessionListCommand {
	type: "session.list";
	requestId?: string;
}

export interface WsSessionSwitchCommand {
	type: "session.switch";
	requestId?: string;
	name: string;
}

export interface WsSessionNewCommand {
	type: "session.new";
	requestId?: string;
	name?: string;
}

export interface WsSessionClearCommand {
	type: "session.clear";
	requestId?: string;
}

export interface WsSessionResetCommand {
	type: "session.reset";
	requestId?: string;
}

export type WsOutgoingCommand =
	| WsPromptCommand
	| WsAbortCommand
	| WsSessionListCommand
	| WsSessionSwitchCommand
	| WsSessionNewCommand
	| WsSessionClearCommand
	| WsSessionResetCommand;

export type WsMessageHandler = (message: WsIncomingMessage) => void;

export class WsClient {
	private ws: WebSocket | null = null;
	private handlers: Set<WsMessageHandler> = new Set();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelay = 1000;
	private maxReconnectDelay = 30000;
	private intentionallyClosed = false;
	private sessionName: string;

	constructor(sessionName = "default") {
		this.sessionName = sessionName;
	}

	connect(): void {
		if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
			return;
		}

		this.intentionallyClosed = false;

		// Build WebSocket URL with session parameter
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/ws?session=${encodeURIComponent(this.sessionName)}`;

		this.ws = new WebSocket(wsUrl);

		this.ws.onopen = () => {
			console.log("[ws] Connected");
			this.reconnectDelay = 1000; // Reset backoff on successful connection
		};

		this.ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data) as WsIncomingMessage;
				for (const handler of this.handlers) {
					handler(message);
				}
			} catch (err) {
				console.error("[ws] Failed to parse message:", err);
			}
		};

		this.ws.onerror = (error) => {
			console.error("[ws] Error:", error);
		};

		this.ws.onclose = () => {
			console.log("[ws] Disconnected");
			this.ws = null;

			if (!this.intentionallyClosed) {
				this.scheduleReconnect();
			}
		};
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			return;
		}

		console.log(`[ws] Reconnecting in ${this.reconnectDelay}ms...`);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
			this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
		}, this.reconnectDelay);
	}

	disconnect(): void {
		this.intentionallyClosed = true;

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	send(command: WsOutgoingCommand): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.error("[ws] Cannot send - not connected");
			return;
		}

		this.ws.send(JSON.stringify(command));
	}

	subscribe(handler: WsMessageHandler): () => void {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}

	setSessionName(name: string): void {
		this.sessionName = name;
	}

	get connected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}
}

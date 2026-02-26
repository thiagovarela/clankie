/**
 * Low-level WebSocket connection manager with auto-reconnect.
 */

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface WebSocketClientOptions {
	url: string;
	authToken: string;
	onMessage: (data: unknown) => void;
	onStateChange: (state: ConnectionState, error?: string) => void;
	reconnect?: boolean;
	reconnectDelay?: number;
	maxReconnectDelay?: number;
}

export class WebSocketClient {
	private ws: WebSocket | null = null;
	private options: WebSocketClientOptions;
	private state: ConnectionState = "disconnected";
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private shouldReconnect = true;

	constructor(options: WebSocketClientOptions) {
		this.options = {
			reconnect: true,
			reconnectDelay: 1000,
			maxReconnectDelay: 30000,
			...options,
		};
	}

	connect(): void {
		if (this.state === "connected" || this.state === "connecting") {
			return;
		}

		this.shouldReconnect = true;
		this.setState("connecting");

		try {
			// Browser WebSocket API doesn't support custom headers (like Authorization)
			// Pass the auth token via URL query parameter instead
			const url = new URL(this.options.url);
			url.searchParams.set("token", this.options.authToken);
			this.ws = new WebSocket(url.toString());

			this.ws.onopen = () => {
				this.reconnectAttempt = 0;
				this.setState("connected");
			};

			this.ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					this.options.onMessage(data);
				} catch (err) {
					console.error("[ws] Failed to parse message:", err);
				}
			};

			this.ws.onerror = (event) => {
				console.error("[ws] WebSocket error:", event);
				this.setState("error", "Connection error");
			};

			this.ws.onclose = () => {
				this.ws = null;
				if (this.shouldReconnect && this.options.reconnect) {
					this.scheduleReconnect();
				} else {
					this.setState("disconnected");
				}
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.setState("error", message);
		}
	}

	disconnect(): void {
		this.shouldReconnect = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.setState("disconnected");
	}

	send(data: unknown): void {
		if (this.state !== "connected" || !this.ws) {
			throw new Error("WebSocket is not connected");
		}
		this.ws.send(JSON.stringify(data));
	}

	getState(): ConnectionState {
		return this.state;
	}

	private setState(state: ConnectionState, error?: string): void {
		if (this.state === state) return;
		this.state = state;
		this.options.onStateChange(state, error);
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;

		const delay = Math.min(this.options.reconnectDelay! * 2 ** this.reconnectAttempt, this.options.maxReconnectDelay!);

		this.reconnectAttempt++;
		console.log(`[ws] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})...`);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}
}

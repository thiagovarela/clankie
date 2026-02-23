/**
 * Main application component
 * Root component that initializes WebSocket connection and renders the main layout
 */

import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import "@mariozechner/mini-lit/dist/Sidebar.js";
import type { Chat } from "./components/chat.ts";
import { state } from "./state.ts";
import type { Session } from "./types.ts";
import { WsClient } from "./ws-client.ts";
import "./components/chat.ts";
import "./components/sidebar.ts";

@customElement("lil-app")
export class App extends LitElement {
	@litState() private wsClient?: WsClient;
	@litState() private connected = false;
	@litState() private sessions: Session[] = [];
	@litState() private currentSessionId: string | null = null;

	private unsubscribe?: () => void;

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	connectedCallback() {
		super.connectedCallback();

		// Initialize WebSocket connection
		this.wsClient = new WsClient();
		this.wsClient.connect();

		// Subscribe to state changes
		this.unsubscribe = state.subscribe(() => {
			this.connected = state.connected;
			this.sessions = state.sessions;
			this.currentSessionId = state.currentSessionId;
		});

		// Handle WebSocket messages
		this.wsClient.subscribe((message) => {
			if (message.type === "ready") {
				state.setConnected(true);
				// Store available sessions
				const sessions = message.sessions.map((name) => ({ id: name }));
				state.setSessions(sessions);
				state.setCurrentSession(message.sessionName);
			} else if (message.type === "response" && (message as { sessions?: string[] }).sessions) {
				// Response from session.list command
				const sessions = ((message as { sessions?: string[] }).sessions || []).map((name) => ({ id: name }));
				state.setSessions(sessions);
			}
		});

		// Set initial state
		this.connected = state.connected;
		this.sessions = state.sessions;
		this.currentSessionId = state.currentSessionId;
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.unsubscribe?.();
		this.wsClient?.disconnect();
	}

	firstUpdated() {
		// Pass WebSocket client to chat component
		const chat = this.querySelector("lil-chat") as Chat;
		if (chat && this.wsClient) {
			chat.setWsClient(this.wsClient);
		}
	}

	private handleSessionNew() {
		if (!this.wsClient) return;
		this.wsClient.send({ type: "session.new" });
	}

	private handleSessionSwitch(e: CustomEvent) {
		if (!this.wsClient) return;
		const { sessionId } = e.detail as { sessionId: string };
		this.wsClient.send({ type: "session.switch", name: sessionId });
	}

	render() {
		return html`
			<!-- Sidebar -->
			<lil-sidebar
				.sessions=${this.sessions}
				.currentSessionId=${this.currentSessionId}
				.connected=${this.connected}
				@session-new=${this.handleSessionNew}
				@session-switch=${this.handleSessionSwitch}
			></lil-sidebar>

			<!-- Main content area with left margin for sidebar -->
			<div class="md:ml-64 min-h-screen flex flex-col">
				${
					this.connected
						? html` <lil-chat class="flex-1"></lil-chat> `
						: html`
							<div class="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
								<div class="text-center space-y-4">
									<div class="text-xl font-semibold text-gray-600 dark:text-gray-400">
										Connecting to server...
									</div>
									<div class="text-sm text-gray-500 dark:text-gray-500">
										Make sure the lil daemon is running
									</div>
								</div>
							</div>
						`
				}
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"lil-app": App;
	}
}

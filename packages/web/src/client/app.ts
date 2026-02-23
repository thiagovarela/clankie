/**
 * Main application component
 * Root component that initializes WebSocket connection and renders the main layout
 */

import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import type { Chat } from "./components/chat.ts";
import { state } from "./state.ts";
import { WsClient } from "./ws-client.ts";
import "./components/chat.ts";

@customElement("lil-app")
export class App extends LitElement {
	@litState() private wsClient?: WsClient;
	@litState() private connected = false;

	private unsubscribe?: () => void;

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	connectedCallback() {
		super.connectedCallback();

		// Initialize WebSocket connection
		this.wsClient = new WsClient();
		this.wsClient.connect();

		// Subscribe to connection state
		this.unsubscribe = state.subscribe(() => {
			this.connected = state.connected;
		});

		// Handle WebSocket messages to update connection state
		this.wsClient.subscribe((message) => {
			if (message.type === "ready") {
				state.setConnected(true);
				// Store available sessions
				const sessions = message.sessions.map((name) => ({ id: name, title: name }));
				state.setSessions(sessions);
				state.setCurrentSession(message.sessionName);
			}
		});

		// Set initial connection state
		this.connected = state.connected;
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

	render() {
		return html`
			<!-- Header -->
			<div
				class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between"
			>
				<div class="flex items-center gap-4">
					<h1 class="text-xl font-bold text-gray-900 dark:text-white">lil</h1>
				</div>

				<div class="flex items-center gap-3">
					${
						this.connected
							? html`<span class="text-xs text-green-600 dark:text-green-400">● Connected</span>`
							: html`<span class="text-xs text-red-600 dark:text-red-400">● Disconnected</span>`
					}

					<theme-toggle></theme-toggle>
				</div>
			</div>

			<!-- Chat area -->
			${
				this.connected
					? html` <lil-chat class="flex-1 min-h-0"></lil-chat> `
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
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"lil-app": App;
	}
}

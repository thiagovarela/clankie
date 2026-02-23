/**
 * Main application component
 *
 * Root component that initializes WebSocket connection and renders the main layout.
 */

import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import { initializeState, state } from "./state.ts";
import { WsClient } from "./ws-client.ts";
import type { LilChat } from "./chat.ts";
import type { LilSessions } from "./sessions.ts";

@customElement("lil-app")
export class LilApp extends LitElement {
	@litState()
	private wsClient?: WsClient;

	createRenderRoot() {
		// Use light DOM for Tailwind classes
		return this;
	}

	connectedCallback() {
		super.connectedCallback();

		// Initialize WebSocket connection
		this.wsClient = new WsClient();
		initializeState(this.wsClient);
		this.wsClient.connect();

		// Subscribe to state changes
		state.subscribe(() => this.requestUpdate());

		// Set up the app layout
		this.style.display = "flex";
		this.style.flexDirection = "column";
		this.style.height = "100vh";
		this.style.overflow = "hidden";
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.wsClient?.disconnect();
	}

	firstUpdated() {
		// Pass WebSocket client to child components
		const chat = this.querySelector("lil-chat") as LilChat;
		const sessions = this.querySelector("lil-sessions") as LilSessions;

		if (chat && this.wsClient) {
			chat.setWsClient(this.wsClient);
		}

		if (sessions && this.wsClient) {
			sessions.setWsClient(this.wsClient);
		}
	}

	render() {
		const currentState = state.value;

		return html`
			<!-- Header -->
			<div class="bg-background border-b border-border px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-4">
					<h1 class="text-xl font-bold">lil</h1>
					${currentState.persona.name !== "default"
						? html`<span class="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
								${currentState.persona.name}
							</span>`
						: null}
				</div>

				<div class="flex items-center gap-3">
					${currentState.connected
						? html`<span class="text-xs text-muted-foreground">Connected</span>`
						: html`<span class="text-xs text-destructive">Disconnected</span>`}

					<lil-sessions></lil-sessions>

					<theme-toggle></theme-toggle>
				</div>
			</div>

			<!-- Chat area -->
			${currentState.connected
				? html`<lil-chat class="flex-1 min-h-0"></lil-chat>`
				: html`
						<div class="flex-1 flex items-center justify-center">
							<div class="text-center space-y-4">
								<div class="text-xl font-semibold text-muted-foreground">Connecting to server...</div>
								<div class="text-sm text-muted-foreground">Make sure the lil daemon is running</div>
							</div>
						</div>
					`}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"lil-app": LilApp;
	}
}

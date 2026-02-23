/**
 * Session management UI
 *
 * Provides session switching, creation, and clearing.
 */

import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@mariozechner/mini-lit/dist/Dialog.js";
import { html, LitElement } from "lit";
import { customElement, state as litState } from "lit/decorators.js";
import { state } from "./state.ts";
import type { WsClient } from "./ws-client.ts";

@customElement("lil-sessions")
export class LilSessions extends LitElement {
	@litState()
	private wsClient?: WsClient;

	@litState()
	private isOpen = false;

	createRenderRoot() {
		return this;
	}

	connectedCallback() {
		super.connectedCallback();
		state.subscribe(() => this.requestUpdate());
	}

	setWsClient(client: WsClient) {
		this.wsClient = client;
	}

	private handleOpen() {
		this.isOpen = true;
		if (this.wsClient) {
			this.wsClient.send({ type: "session.list" });
		}
	}

	private handleClose() {
		this.isOpen = false;
	}

	private handleSwitch(sessionName: string) {
		if (!this.wsClient) return;

		this.wsClient.send({
			type: "session.switch",
			name: sessionName,
		});

		this.isOpen = false;
	}

	private handleNew() {
		if (!this.wsClient) return;

		const name = prompt("Enter a name for the new session:");
		if (!name) return;

		this.wsClient.send({
			type: "session.new",
			name,
		});

		this.isOpen = false;
	}

	private handleClear() {
		if (!this.wsClient) return;
		if (!confirm("Clear current session? This will delete all messages.")) return;

		this.wsClient.send({
			type: "session.clear",
		});
	}

	render() {
		const currentState = state.value;

		return html`
			${Button({
				variant: "outline",
				size: "sm",
				onClick: () => this.handleOpen(),
				children: html`
					<span class="text-sm font-medium">${currentState.sessionName}</span>
					<span class="text-xs text-muted-foreground ml-2">(${currentState.sessions.length} sessions)</span>
				`,
			})}
			${this.isOpen
				? Dialog({
						isOpen: this.isOpen,
						onClose: () => this.handleClose(),
						children: html`
							${DialogContent(html`
								${DialogHeader({
									title: "Sessions",
									description: "Manage your conversation sessions",
								})}

								<div class="space-y-2 max-h-[400px] overflow-y-auto">
									${currentState.sessions.length === 0
										? html`<div class="text-center text-muted-foreground py-8">No sessions yet</div>`
										: currentState.sessions.map(
												(sessionName) => html`
													<button
														class="w-full text-left px-4 py-3 rounded-lg hover:bg-accent transition ${sessionName ===
														currentState.sessionName
															? "bg-accent border-2 border-primary"
															: "border border-border"}"
														@click=${() => this.handleSwitch(sessionName)}
													>
														<div class="font-medium">${sessionName}</div>
														${sessionName === currentState.sessionName
															? html`<div class="text-xs text-muted-foreground mt-1">Active</div>`
															: null}
													</button>
												`,
											)}
								</div>

								${DialogFooter(html`
									${Button({
										variant: "outline",
										onClick: () => this.handleClear(),
										children: "Clear Current",
									})}
									${Button({
										variant: "default",
										onClick: () => this.handleNew(),
										children: "New Session",
									})}
								`)}
							`)}
						`,
					})
				: null}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"lil-sessions": LilSessions;
	}
}

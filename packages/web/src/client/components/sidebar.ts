/**
 * Sidebar component
 * Session management sidebar with refined warmth design
 */

import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { MessageSquarePlus } from "lucide";
import type { Session } from "../types.ts";

@customElement("lil-sidebar")
export class LilSidebar extends LitElement {
	@property({ type: Array }) sessions: Session[] = [];
	@property({ type: String }) currentSessionId: string | null = null;
	@property({ type: Boolean }) connected = false;

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	private handleNewChat() {
		this.dispatchEvent(new CustomEvent("session-new"));
	}

	private handleSessionClick(sessionId: string) {
		if (sessionId !== this.currentSessionId) {
			this.dispatchEvent(
				new CustomEvent("session-switch", {
					detail: { sessionId },
				}),
			);
		}
	}

	private formatSessionName(name: string): string {
		// Format session names for display
		// "default" → "Default"
		// "session-1771755393484" → "Session • Feb 23"
		if (name === "default") {
			return "Default";
		}

		if (name.startsWith("session-")) {
			const timestamp = Number.parseInt(name.substring(8), 10);
			if (!Number.isNaN(timestamp)) {
				const date = new Date(timestamp);
				const formatted = date.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				});
				return `Session • ${formatted}`;
			}
		}

		// Fallback: just clean up the name
		return name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
	}

	render() {
		// Prepare session items with warm accent bar for active session
		const sessionItems = this.sessions.map((session) => {
			const isActive = session.id === this.currentSessionId;
			return html`
				<button
					@click=${() => this.handleSessionClick(session.id)}
					class="group relative block w-full text-left px-3 py-2.5 text-sm rounded-md transition-all duration-200 ${
						isActive
							? "bg-muted/50 text-foreground font-medium"
							: "text-muted-foreground hover:text-foreground hover:bg-muted/30"
					}"
				>
					${
						isActive
							? html`<div
								class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-accent rounded-r"
							></div>`
							: ""
					}
					<span class="truncate block ${isActive ? "ml-2" : ""}">${this.formatSessionName(session.id)}</span>
				</button>
			`;
		});

		const content = html`
			<!-- New Chat Button - subtle link style -->
			<button
				@click=${this.handleNewChat.bind(this)}
				class="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-accent transition-colors mb-6 group"
			>
				${icon(MessageSquarePlus, "sm")}
				<span class="group-hover:translate-x-0.5 transition-transform">New conversation</span>
			</button>

			<!-- Sessions -->
			${
				this.sessions.length > 0
					? html`
						<div class="space-y-1">
							<h4 class="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70 mb-3">
								Recent
							</h4>
							<div class="space-y-0.5">${sessionItems}</div>
						</div>
					`
					: html`
						<div class="px-3 text-sm text-muted-foreground/50 text-center py-12 font-light">
							No conversations yet
						</div>
					`
			}
		`;

		const logo = html`
			<div class="px-1">
				<h1 class="text-3xl font-display tracking-tight text-foreground">lil</h1>
			</div>
		`;

		const footer = html`
			<div class="flex items-center justify-between px-1">
				<div class="flex items-center gap-2">
					<div
						class="w-2 h-2 rounded-full ${this.connected ? "bg-accent" : "bg-destructive"} ${
							this.connected ? "animate-pulse" : ""
						}"
					></div>
					<span class="text-xs text-muted-foreground">${this.connected ? "Connected" : "Offline"}</span>
				</div>
				<theme-toggle></theme-toggle>
			</div>
		`;

		return html`
			<mini-sidebar
				class="border-r border-border/50 bg-card"
				.content=${content}
				.logo=${logo}
				.footer=${footer}
			>
			</mini-sidebar>
		`;
	}
}

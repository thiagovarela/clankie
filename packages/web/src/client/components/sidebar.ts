/**
 * Sidebar component
 * Session management sidebar with new chat, session list, and footer
 */

import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import { SidebarItem, SidebarSection } from "@mariozechner/mini-lit/dist/Sidebar.js";
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
		// Prepare session items
		const sessionItems = this.sessions.map((session) =>
			SidebarItem({
				active: session.id === this.currentSessionId,
				onClick: () => this.handleSessionClick(session.id),
				children: html`
						<div class="flex items-center gap-2">
							<span class="flex-1 truncate">${this.formatSessionName(session.id)}</span>
						</div>
					`,
			}),
		);

		const content = html`
			<!-- New Chat Button -->
			<div class="mb-4">
				${Button({
					variant: "outline",
					className: "w-full justify-start gap-2",
					onClick: this.handleNewChat.bind(this),
					children: html`
						${icon(MessageSquarePlus, "sm")}
						<span>New Chat</span>
					`,
				})}
			</div>

			<!-- Sessions -->
			${
				this.sessions.length > 0
					? SidebarSection({
							title: "Recent",
							children: html`${sessionItems}`,
						})
					: html`
						<div class="text-sm text-muted-foreground text-center py-8">
							No sessions yet. Start a conversation!
						</div>
					`
			}
		`;

		const footer = html`
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="text-xs ${this.connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}">
						● ${this.connected ? "Connected" : "Disconnected"}
					</span>
				</div>
				<theme-toggle></theme-toggle>
			</div>
		`;

		return html`
			<mini-sidebar .content=${content} .logo=${html`<h1 class="text-xl font-bold">lil</h1>`} .footer=${footer}>
			</mini-sidebar>
		`;
	}
}

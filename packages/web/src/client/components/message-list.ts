/**
 * Message list component
 * Displays chat messages with Claude-style clean layout
 */

import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderMarkdown } from "../markdown.ts";
import type { Message } from "../types.ts";
import "./tool-renderer.ts";

@customElement("lil-message-list")
export class MessageList extends LitElement {
	@property({ type: Array }) messages: Message[] = [];

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	private formatTime(timestamp?: number): string {
		if (!timestamp) return "";
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	private renderMessage(message: Message, index: number) {
		const isUser = message.role === "user";
		const showRole = index === 0 || this.messages[index - 1]?.role !== message.role;

		return html`
			<div class="mb-8 animate-fade-in">
				<!-- Role label -->
				${
					showRole
						? html`
							<div class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
								${isUser ? "You" : "lil"}
							</div>
						`
						: ""
				}

				<!-- Message content -->
				<div class="prose prose-sm max-w-none">
					${unsafeHTML(renderMarkdown(message.content))}
				</div>

				<!-- Attachments -->
				${
					message.attachments?.length
						? html`
							<div class="mt-3 flex flex-wrap gap-2">
								${message.attachments.map(
									(att) => html`
										<div
											class="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5 flex items-center gap-2"
										>
											<span class="opacity-60">📎</span>
											<span>${att.fileName}</span>
										</div>
									`,
								)}
							</div>
						`
						: ""
				}

				<!-- Thinking (for assistant messages) -->
				${
					!isUser && message.thinking
						? html`
							<details class="mt-3 group">
								<summary
									class="text-xs text-muted-foreground/70 italic cursor-pointer hover:text-muted-foreground list-none flex items-center gap-1.5"
								>
									<span class="inline-block transition-transform group-open:rotate-90">▸</span>
									<span>Thinking</span>
								</summary>
								<div class="mt-2 text-sm text-muted-foreground/80 italic pl-4 border-l-2 border-muted">
									${message.thinking}
								</div>
							</details>
						`
						: ""
				}

				<!-- Tool calls -->
				${
					!isUser && message.toolCalls?.length
						? html`
							<div class="mt-4 space-y-3">
								${message.toolCalls.map((tool) => html` <lil-tool-renderer .tool=${tool}></lil-tool-renderer> `)}
							</div>
						`
						: ""
				}

				<!-- Timestamp -->
				${
					message.timestamp
						? html`
							<div class="mt-2 text-xs text-muted-foreground/50">${this.formatTime(message.timestamp)}</div>
						`
						: ""
				}
			</div>
		`;
	}

	render() {
		if (this.messages.length === 0) {
			return html`
				<div class="flex flex-col items-center justify-center h-full text-center py-16">
					<h2 class="text-5xl font-display mb-4 text-foreground">lil</h2>
					<p class="text-sm text-muted-foreground">Your personal AI assistant</p>
				</div>
			`;
		}

		return html`
			<div class="flex flex-col space-y-4">${this.messages.map((msg, idx) => this.renderMessage(msg, idx))}</div>
		`;
	}
}

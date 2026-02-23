/**
 * Message list component
 * Displays chat messages with markdown rendering and tool calls
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

	private renderMessage(message: Message) {
		const isUser = message.role === "user";
		const alignClass = isUser ? "justify-end" : "justify-start";
		const bgClass = isUser ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100";

		return html`
			<div class="flex ${alignClass} mb-4">
				<div class="max-w-[80%]">
					<!-- Message bubble -->
					<div class="${bgClass} rounded-2xl px-4 py-2 shadow-sm">
						<!-- Content -->
						<div class="prose prose-sm dark:prose-invert max-w-none">
							${unsafeHTML(renderMarkdown(message.content))}
						</div>

						<!-- Attachments -->
						${
							message.attachments?.length
								? html`
									<div class="mt-2 flex flex-wrap gap-2">
										${message.attachments.map(
											(att) => html`
												<div
													class="text-xs opacity-80 bg-black/10 dark:bg-white/10 rounded px-2 py-1"
												>
													📎 ${att.fileName}
												</div>
											`,
										)}
									</div>
								`
								: ""
						}
					</div>

					<!-- Thinking (for assistant messages) -->
					${
						!isUser && message.thinking
							? html`
								<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
									💭 ${message.thinking}
								</div>
							`
							: ""
					}

					<!-- Tool calls -->
					${
						!isUser && message.toolCalls?.length
							? html`
								<div class="mt-2 space-y-2">
									${message.toolCalls.map((tool) => html` <lil-tool-renderer .tool=${tool}></lil-tool-renderer> `)}
								</div>
							`
							: ""
					}

					<!-- Timestamp -->
					${
						message.timestamp
							? html`
								<div class="mt-1 text-xs text-gray-400 dark:text-gray-500 text-right">
									${this.formatTime(message.timestamp)}
								</div>
							`
							: ""
					}
				</div>
			</div>
		`;
	}

	render() {
		if (this.messages.length === 0) {
			return html`
				<div class="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
					<div class="text-center">
						<div class="text-4xl mb-2">💬</div>
						<div>Start a conversation...</div>
					</div>
				</div>
			`;
		}

		return html` <div class="flex flex-col">${this.messages.map((msg) => this.renderMessage(msg))}</div> `;
	}
}

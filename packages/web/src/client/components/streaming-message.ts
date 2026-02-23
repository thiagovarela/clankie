/**
 * Streaming message component
 * Shows assistant's message as it's being streamed
 */

import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderMarkdown } from "../markdown.ts";
import type { ToolCall } from "../types.ts";
import "./tool-renderer.ts";

@customElement("lil-streaming-message")
export class StreamingMessage extends LitElement {
	@property({ type: String }) content = "";
	@property({ type: String }) thinking?: string;
	@property({ type: Array }) toolCalls?: ToolCall[];

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	render() {
		if (!this.content && !this.thinking && !this.toolCalls?.length) {
			return html``;
		}

		return html`
			<div class="flex justify-start mb-4">
				<div class="max-w-[80%]">
					<!-- Streaming indicator -->
					<div class="flex items-center gap-2 mb-1">
						<div class="flex gap-1">
							<div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
							<div
								class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
								style="animation-delay: 0.2s"
							></div>
							<div
								class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
								style="animation-delay: 0.4s"
							></div>
						</div>
						<span class="text-xs text-gray-500 dark:text-gray-400">Assistant is typing...</span>
					</div>

					<!-- Message content -->
					${
						this.content
							? html`
								<div
									class="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-2xl px-4 py-2 shadow-sm"
								>
									<div class="prose prose-sm dark:prose-invert max-w-none">
										${unsafeHTML(renderMarkdown(this.content))}
									</div>
								</div>
							`
							: ""
					}

					<!-- Thinking -->
					${
						this.thinking
							? html`
								<div class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
									💭 ${this.thinking}
								</div>
							`
							: ""
					}

					<!-- Tool calls -->
					${
						this.toolCalls?.length
							? html`
								<div class="mt-2 space-y-2">
									${this.toolCalls.map((tool) => html` <lil-tool-renderer .tool=${tool}></lil-tool-renderer> `)}
								</div>
							`
							: ""
					}
				</div>
			</div>
		`;
	}
}

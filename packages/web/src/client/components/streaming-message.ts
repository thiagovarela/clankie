/**
 * Streaming message component
 * Shows assistant's message as it's being streamed (Claude-style)
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
			<div class="mb-8 animate-fade-in">
				<!-- Role label with streaming indicator -->
				<div class="flex items-center gap-2 mb-2">
					<span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">lil</span>
					<div class="flex items-center gap-1">
						<div class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"></div>
						<div class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
						<div class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
					</div>
				</div>

				<!-- Message content -->
				${
					this.content
						? html`
							<div class="prose prose-sm max-w-none">
								${unsafeHTML(renderMarkdown(this.content))}
								<span class="inline-block w-1.5 h-4 bg-accent/50 animate-pulse ml-0.5 align-middle"></span>
							</div>
						`
						: ""
				}

				<!-- Thinking -->
				${
					this.thinking
						? html`
							<details class="mt-3 group" open>
								<summary
									class="text-xs text-muted-foreground/70 italic cursor-pointer hover:text-muted-foreground list-none flex items-center gap-1.5"
								>
									<span class="inline-block transition-transform group-open:rotate-90">▸</span>
									<span>Thinking</span>
								</summary>
								<div class="mt-2 text-sm text-muted-foreground/80 italic pl-4 border-l-2 border-accent/30">
									${this.thinking}
								</div>
							</details>
						`
						: ""
				}

				<!-- Tool calls -->
				${
					this.toolCalls?.length
						? html`
							<div class="mt-4 space-y-3">
								${this.toolCalls.map((tool) => html` <lil-tool-renderer .tool=${tool}></lil-tool-renderer> `)}
							</div>
						`
						: ""
				}
			</div>
		`;
	}
}

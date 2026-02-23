/**
 * Tool call renderer
 * Displays tool calls with their results
 */

import { html, LitElement } from "lit";
import { customElement, state as litState, property } from "lit/decorators.js";
import type { ToolCall } from "../types.ts";

@customElement("lil-tool-renderer")
export class ToolRenderer extends LitElement {
	@property({ type: Object }) tool!: ToolCall;
	@litState() expanded = false;

	createRenderRoot() {
		return this; // Use light DOM for Tailwind classes
	}

	private toggleExpanded() {
		this.expanded = !this.expanded;
	}

	private renderBash() {
		const command = this.tool.parameters.command as string;
		const result = this.tool.result;
		const error = this.tool.error;

		return html`
			<div class="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
				<!-- Header -->
				<button
					@click=${this.toggleExpanded}
					class="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
				>
					<span class="text-lg">⚡</span>
					<span class="flex-1 text-left">Bash Command</span>
					<span class="text-xs text-gray-500">${this.expanded ? "▼" : "▶"}</span>
				</button>

				<!-- Content -->
				${
					this.expanded
						? html`
							<div class="p-3 space-y-2">
								<!-- Command -->
								<div>
									<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Command:</div>
									<pre
										class="bg-black text-green-400 p-2 rounded text-sm overflow-x-auto"
									><code>$ ${command}</code></pre>
								</div>

								<!-- Result or Error -->
								${
									result
										? html`
											<div>
												<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Output:</div>
												<pre
													class="bg-black text-gray-300 p-2 rounded text-sm overflow-x-auto max-h-64"
												><code>${result}</code></pre>
											</div>
										`
										: ""
								}
								${
									error
										? html`
											<div>
												<div class="text-xs text-red-500 mb-1">Error:</div>
												<pre
													class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-2 rounded text-sm overflow-x-auto"
												><code>${error}</code></pre>
											</div>
										`
										: ""
								}
								${!result && !error ? html`<div class="text-xs text-gray-400 italic">Running...</div>` : ""}
							</div>
						`
						: ""
				}
			</div>
		`;
	}

	private renderDefault() {
		const params = JSON.stringify(this.tool.parameters, null, 2);
		const result = this.tool.result;
		const error = this.tool.error;

		return html`
			<div class="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
				<!-- Header -->
				<button
					@click=${this.toggleExpanded}
					class="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
				>
					<span class="text-lg">🔧</span>
					<span class="flex-1 text-left">${this.tool.name}</span>
					<span class="text-xs text-gray-500">${this.expanded ? "▼" : "▶"}</span>
				</button>

				<!-- Content -->
				${
					this.expanded
						? html`
							<div class="p-3 space-y-2">
								<!-- Parameters -->
								<div>
									<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Parameters:</div>
									<pre
										class="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm overflow-x-auto"
									><code>${params}</code></pre>
								</div>

								<!-- Result or Error -->
								${
									result
										? html`
											<div>
												<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Result:</div>
												<pre
													class="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm overflow-x-auto max-h-64"
												><code>${result}</code></pre>
											</div>
										`
										: ""
								}
								${
									error
										? html`
											<div>
												<div class="text-xs text-red-500 mb-1">Error:</div>
												<pre
													class="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-2 rounded text-sm overflow-x-auto"
												><code>${error}</code></pre>
											</div>
										`
										: ""
								}
								${!result && !error ? html`<div class="text-xs text-gray-400 italic">Running...</div>` : ""}
							</div>
						`
						: ""
				}
			</div>
		`;
	}

	render() {
		// Render bash tool specially, use default for others
		if (this.tool.name === "bash") {
			return this.renderBash();
		}
		return this.renderDefault();
	}
}

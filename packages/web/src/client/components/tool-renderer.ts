/**
 * Tool call renderer
 * Displays tool calls with warm, refined styling
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
			<div class="bg-muted/30 rounded-lg overflow-hidden border border-border/50">
				<!-- Header -->
				<button
					@click=${this.toggleExpanded}
					class="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
				>
					<span class="font-mono text-accent">$</span>
					<span class="flex-1 text-left text-foreground">Bash Command</span>
					<span class="text-xs text-muted-foreground transition-transform ${this.expanded ? "rotate-180" : ""}"
						>▼</span
					>
				</button>

				<!-- Content -->
				${
					this.expanded
						? html`
							<div class="p-4 space-y-3">
								<!-- Command -->
								<div>
									<div class="text-xs text-muted-foreground/70 mb-1.5 uppercase tracking-wider">
										Command
									</div>
									<pre
										class="font-mono bg-[hsl(25_15%_15%)] text-[hsl(40_15%_92%)] p-3 rounded-md text-sm overflow-x-auto"
									><code>$ ${command}</code></pre>
								</div>

								<!-- Result or Error -->
								${
									result
										? html`
											<div>
												<div class="text-xs text-muted-foreground/70 mb-1.5 uppercase tracking-wider">
													Output
												</div>
												<pre
													class="font-mono bg-[hsl(25_15%_15%)] text-[hsl(40_15%_85%)] p-3 rounded-md text-sm overflow-x-auto max-h-64"
												><code>${result}</code></pre>
											</div>
										`
										: ""
								}
								${
									error
										? html`
											<div>
												<div class="text-xs text-destructive mb-1.5 uppercase tracking-wider">Error</div>
												<pre
													class="font-mono bg-destructive/10 text-destructive p-3 rounded-md text-sm overflow-x-auto"
												><code>${error}</code></pre>
											</div>
										`
										: ""
								}
								${!result && !error ? html`<div class="text-xs text-muted-foreground/50 italic">Running...</div>` : ""}
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
			<div class="bg-muted/30 rounded-lg overflow-hidden border border-border/50">
				<!-- Header -->
				<button
					@click=${this.toggleExpanded}
					class="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
				>
					<span class="text-accent">⚙</span>
					<span class="flex-1 text-left text-foreground">${this.tool.name}</span>
					<span class="text-xs text-muted-foreground transition-transform ${this.expanded ? "rotate-180" : ""}"
						>▼</span
					>
				</button>

				<!-- Content -->
				${
					this.expanded
						? html`
							<div class="p-4 space-y-3">
								<!-- Parameters -->
								<div>
									<div class="text-xs text-muted-foreground/70 mb-1.5 uppercase tracking-wider">
										Parameters
									</div>
									<pre
										class="font-mono bg-muted p-3 rounded-md text-sm overflow-x-auto text-foreground"
									><code>${params}</code></pre>
								</div>

								<!-- Result or Error -->
								${
									result
										? html`
											<div>
												<div class="text-xs text-muted-foreground/70 mb-1.5 uppercase tracking-wider">
													Result
												</div>
												<pre
													class="font-mono bg-muted p-3 rounded-md text-sm overflow-x-auto max-h-64 text-foreground"
												><code>${result}</code></pre>
											</div>
										`
										: ""
								}
								${
									error
										? html`
											<div>
												<div class="text-xs text-destructive mb-1.5 uppercase tracking-wider">Error</div>
												<pre
													class="font-mono bg-destructive/10 text-destructive p-3 rounded-md text-sm overflow-x-auto"
												><code>${error}</code></pre>
											</div>
										`
										: ""
								}
								${!result && !error ? html`<div class="text-xs text-muted-foreground/50 italic">Running...</div>` : ""}
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

/**
 * Reload Runtime Extension
 *
 * Provides a /reload-runtime command and reload_runtime tool that the LLM can use
to trigger a reload of all sessions after installing/creating skills or extensions.
 * This ensures all cached sessions pick up newly installed resources.
 */

import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Create the reload runtime extension factory.
 *
 * @param reloadAllSessions - Function to reload all cached sessions
 */
export function createReloadRuntimeExtension(reloadAllSessions: () => Promise<void>): ExtensionFactory {
	return function reloadRuntime(pi: ExtensionAPI) {
		// Command entrypoint for reload. Treat reload as terminal for this handler.
		pi.registerCommand("reload-runtime", {
			description: "Reload extensions, skills, prompts, and themes for all sessions",
			handler: async (_args, ctx) => {
				// Reload the current session first
				await ctx.reload();
				// Then reload all other cached sessions
				await reloadAllSessions();
				return;
			},
		});

		// LLM-callable tool. Tools get ExtensionContext, so they cannot call ctx.reload() directly.
		// Instead, queue a follow-up user command that executes the command above.
		pi.registerTool({
			name: "reload_runtime",
			label: "Reload Runtime",
			description:
				"Reload extensions, skills, prompts, and themes for all sessions. Call this after installing or creating new skills/extensions.",
			parameters: Type.Object({}),
			async execute() {
				pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
				return {
					content: [
						{
							type: "text",
							text: "Queued /reload-runtime — all sessions will reload to pick up any newly installed resources.",
						},
					],
					details: {},
				};
			},
		});
	};
}

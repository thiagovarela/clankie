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
		let pendingReload = false;

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

		// Defer tool-triggered runtime reload until the current agent run completes.
		// This avoids sending /reload-runtime as a user follow-up, which can loop.
		pi.on("agent_end", () => {
			if (!pendingReload) return;
			pendingReload = false;
			setTimeout(() => {
				reloadAllSessions().catch((err) => {
					console.error("[reload-runtime] Failed to reload sessions:", err);
				});
			}, 0);
		});

		pi.registerTool({
			name: "reload_runtime",
			label: "Reload Runtime",
			description:
				"Reload extensions, skills, prompts, and themes for all sessions. Call this after installing or creating new skills/extensions.",
			parameters: Type.Object({}),
			async execute() {
				pendingReload = true;
				return {
					content: [
						{
							type: "text",
							text: "Runtime reload scheduled. All sessions will reload to pick up newly installed resources after this response completes.",
						},
					],
					details: {},
				};
			},
		});
	};
}

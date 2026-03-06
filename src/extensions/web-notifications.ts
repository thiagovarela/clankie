/**
 * Web Notifications Extension
 *
 * Web UI Channel Only
 *
 * Provides a notify_web_ui tool that allows the LLM to send notifications
 * specifically to users through the web UI channel. These notifications appear
 * in the web UI notification panel and trigger toast alerts.
 *
 * IMPORTANT: This extension is EXCLUSIVE to the web UI channel. Other channels
 * (Telegram, etc.) have their own notification mechanisms and should NOT use
 * this tool. The notification system is channel-specific by design.
 *
 * For other channels, use their native notification APIs instead.
 */

import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { createNotification } from "../notifications.ts";

const NotifyWebUIParamsSchema = Type.Object({
	title: Type.String({
		description: "Short notification title (max 100 characters)",
		maxLength: 100,
	}),
	message: Type.String({
		description: "Detailed notification message",
	}),
	type: StringEnum(["info", "warning", "error", "success"] as const),
	actionUrl: Type.Optional(
		Type.String({
			description: "Optional URL path (e.g., /sessions/abc123) to link to when user clicks the notification",
		}),
	),
});

type NotifyWebUIParams = {
	title: string;
	message: string;
	type: "info" | "warning" | "error" | "success";
	actionUrl?: string;
};

type NotifyWebUIDetails =
	| { success: true; notificationId: string; timestamp: string }
	| { success: false; error: string };

/**
 * Create the web notifications extension factory.
 *
 * WEB UI CHANNEL ONLY: This extension provides notifications exclusively
 * for the web UI channel. Do not use for other channels.
 */
export function createWebNotificationsExtension(): ExtensionFactory {
	return function webNotificationsExtension(pi: ExtensionAPI) {
		pi.registerTool({
			name: "notify_web_ui",
			label: "Notify Web UI",
			description:
				"[WEB UI CHANNEL ONLY] Send a notification to the user through the web UI. " +
				"This creates a persistent notification that appears in the web UI notifications panel " +
				"and triggers a real-time toast alert. Use this to inform users about important events, " +
				"task completions, errors, or status updates when they may not be actively viewing the session. " +
				"IMPORTANT: This tool is exclusive to the web UI channel and has no effect on other channels.",
			parameters: NotifyWebUIParamsSchema,
			async execute(_toolCallId, rawParams): Promise<{
				content: Array<{ type: "text"; text: string }>;
				details: NotifyWebUIDetails;
			}> {
				const params = rawParams as NotifyWebUIParams;

				try {
					const notification = createNotification({
						type: params.type,
						source: "session",
						title: params.title,
						message: params.message,
						actionUrl: params.actionUrl,
					});

					return {
						content: [
							{
								type: "text" as const,
								text: `Web UI notification sent: "${params.title}"`,
							},
						],
						details: {
							success: true,
							notificationId: notification.id,
							timestamp: notification.timestamp,
						},
					};
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to send web UI notification: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
						details: {
							success: false,
							error: err instanceof Error ? err.message : String(err),
						},
					};
				}
			},
		});

		// Add a hint to the system prompt about the web notification capability
		// Explicitly note this is for web UI only to avoid confusion with other channels
		pi.on("before_agent_start", async (event) => {
			return {
				systemPrompt:
					event.systemPrompt +
					"\n\n[Web UI Channel] You can send notifications to the web UI using the notify_web_ui tool. " +
					"This is useful for: task completions, errors requiring attention, " +
					"long-running operations finishing, or critical status updates. " +
					"Notifications appear in the user's web UI notification panel, trigger toast alerts, " +
					"and persist across page refreshes. Note: This tool is specific to the web UI channel.",
			};
		});
	};
}

/**
 * Notifications Extension
 *
 * Provides a notify_user tool that allows the LLM to send notifications
 * to the user through the web UI notification system.
 */

import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { createNotification } from "../notifications.ts";

const NotifyUserParamsSchema = Type.Object({
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
			description: "Optional URL to link to when user clicks the notification",
		}),
	),
});

type NotifyUserParams = {
	title: string;
	message: string;
	type: "info" | "warning" | "error" | "success";
	actionUrl?: string;
};

type NotifyUserDetails =
	| { success: true; notificationId: string; timestamp: string }
	| { success: false; error: string };

/**
 * Create the notifications extension factory.
 */
export function createNotificationsExtension(): ExtensionFactory {
	return function notificationsExtension(pi: ExtensionAPI) {
		pi.registerTool({
			name: "notify_user",
			label: "Notify User",
			description:
				"Send a notification to the user through the web UI. " +
				"Use this to alert the user about important events, task completions, " +
				"errors, or anything that requires their attention even if they're not " +
				"actively watching the conversation. Notifications persist across page " +
				"refreshes and are shown in the notifications panel.",
			parameters: NotifyUserParamsSchema,
			async execute(_toolCallId, rawParams): Promise<{
				content: Array<{ type: "text"; text: string }>;
				details: NotifyUserDetails;
			}> {
				const params = rawParams as NotifyUserParams;

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
								text: `Notification sent: "${params.title}"`,
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
								text: `Failed to send notification: ${err instanceof Error ? err.message : String(err)}`,
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

		// Add a hint to the system prompt about the notification capability
		pi.on("before_agent_start", async (event) => {
			return {
				systemPrompt:
					event.systemPrompt +
					"\n\nYou can notify the user about important events using the notify_user tool. " +
					"This is useful for: task completions, errors requiring attention, " +
					"long-running operations finishing, or critical status updates. " +
					"Notifications appear in the web UI notifications panel and persist across sessions.",
			};
		});
	};
}

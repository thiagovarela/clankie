/**
 * schedule_task tool - Simple interface for agent self-scheduling
 *
 * Allows the agent to schedule follow-up tasks that fork from the current session,
 * preserving full conversation context.
 *
 * Example:
 *   schedule_task({ delay: "5m", message: "Check if the build succeeded" })
 */

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { CronScheduler } from "./scheduler.ts";

let scheduler: CronScheduler | null = null;

export function setScheduleTaskScheduler(value: CronScheduler | null): void {
	scheduler = value;
}

const ScheduleTaskParamsSchema = Type.Object({
	delay: Type.Optional(
		Type.String({
			description:
				'Delay before running the task. Examples: "5m", "1h", "30s", "2h30m". ' +
				"Supports seconds (s), minutes (m), hours (h).",
		}),
	),
	delayMs: Type.Optional(
		Type.Number({
			description: "Delay in milliseconds (alternative to delay string)",
		}),
	),
	at: Type.Optional(
		Type.String({
			description: "ISO timestamp to run the task at (alternative to delay)",
		}),
	),
	message: Type.String({
		description: "The prompt/message to run when the task executes",
	}),
	name: Type.Optional(
		Type.String({
			description: "Human-readable name for the task (auto-generated if not provided)",
		}),
	),
});

type ScheduleTaskParams = {
	delay?: string;
	delayMs?: number;
	at?: string;
	message: string;
	name?: string;
};

/**
 * Parse a human-friendly delay string into milliseconds.
 * Supports: "30s", "5m", "1h", "2h30m", "1h30m15s"
 */
function parseDelay(delay: string): number {
	const trimmed = delay.trim().toLowerCase();

	let totalMs = 0;
	let remaining = trimmed;

	// Match hours
	const hoursMatch = remaining.match(/(\d+)\s*h/);
	if (hoursMatch) {
		totalMs += parseInt(hoursMatch[1], 10) * 60 * 60 * 1000;
		remaining = remaining.replace(hoursMatch[0], "");
	}

	// Match minutes
	const minutesMatch = remaining.match(/(\d+)\s*m(?!s)/);
	if (minutesMatch) {
		totalMs += parseInt(minutesMatch[1], 10) * 60 * 1000;
		remaining = remaining.replace(minutesMatch[0], "");
	}

	// Match seconds
	const secondsMatch = remaining.match(/(\d+)\s*s/);
	if (secondsMatch) {
		totalMs += parseInt(secondsMatch[1], 10) * 1000;
		remaining = remaining.replace(secondsMatch[0], "");
	}

	// Match milliseconds
	const msMatch = remaining.match(/(\d+)\s*ms/);
	if (msMatch) {
		totalMs += parseInt(msMatch[1], 10);
	}

	if (totalMs === 0) {
		throw new Error(
			`Invalid delay format: "${delay}". Use formats like "5m", "1h", "30s", "2h30m".`,
		);
	}

	return totalMs;
}

/**
 * Generate a short task name from the message
 */
function generateTaskName(message: string): string {
	const preview = message.slice(0, 40).replace(/\n/g, " ").trim();
	return preview.length < message.length ? `${preview}...` : preview;
}

/**
 * Format milliseconds into a human-readable string
 */
function formatDelay(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${Math.round(ms / 1000)}s`;
	if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
	const hours = Math.floor(ms / 3600000);
	const minutes = Math.round((ms % 3600000) / 60000);
	return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
}

export function createScheduleTaskTool() {
	return function scheduleTaskExtension(pi: ExtensionAPI) {
		// Fallback tracking for session context (used if ctx.sessionManager is unavailable)
		let currentSessionFile: string | undefined;
		let currentEntryId: string | undefined;

		// Track session file and latest user entry as fallback
		pi.on("session_start", (_event, ctx) => {
			const sessionCtx = ctx as { sessionFile?: string };
			currentSessionFile = sessionCtx.sessionFile;
			currentEntryId = undefined;
		});

		pi.on("message_end", (event, _ctx) => {
			const entryEvent = event as { entryId?: string; role?: string };
			if (entryEvent.entryId && entryEvent.role === "user") {
				currentEntryId = entryEvent.entryId;
			}
		});

		pi.registerTool({
			name: "schedule_task",
			label: "Schedule Task",
			description:
				"Schedule a follow-up task to run after a delay. The task will fork from the current " +
				"conversation, preserving full context. Use this when you need to check on something later, " +
				'like monitoring a build, waiting for a process, or following up on an action. ' +
				'Example: schedule_task({ delay: "5m", message: "Check if deployment succeeded" })',
			parameters: ScheduleTaskParamsSchema,
			async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
				const params = rawParams as ScheduleTaskParams;

				if (!scheduler) {
					return {
						content: [{ type: "text" as const, text: "Scheduler is not running. Cannot schedule task." }],
						details: {},
					};
				}

				// Validate we have exactly one timing option
				const timingOptions = [params.delay, params.delayMs, params.at].filter((x) => x !== undefined);
				if (timingOptions.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Must specify one of: delay, delayMs, or at" }],
						details: {},
					};
				}
				if (timingOptions.length > 1) {
					return {
						content: [{ type: "text" as const, text: "Specify only one of: delay, delayMs, or at" }],
						details: {},
					};
				}

				try {
					// Calculate the schedule
					let schedule: { kind: "at"; at: string } | { kind: "every"; intervalMs: number };
					let delayDescription: string;

					if (params.at) {
						const timestamp = new Date(params.at);
						if (isNaN(timestamp.getTime())) {
							throw new Error(`Invalid timestamp: ${params.at}`);
						}
						schedule = { kind: "at", at: timestamp.toISOString() };
						delayDescription = `at ${timestamp.toLocaleString()}`;
					} else {
						const delayMs = params.delayMs ?? parseDelay(params.delay!);
						const runAt = new Date(Date.now() + delayMs);
						schedule = { kind: "at", at: runAt.toISOString() };
						delayDescription = `in ${formatDelay(delayMs)}`;
					}

					const taskName = params.name ?? generateTaskName(params.message);

					// Get fork context from the execution context
					let sessionFile: string | undefined;
					let entryId: string | undefined;

					if (ctx?.sessionManager) {
						sessionFile = ctx.sessionManager.getSessionFile();
						
						// Find the last user message entry to fork from
						const entries = ctx.sessionManager.getEntries();
						for (let i = entries.length - 1; i >= 0; i--) {
							const entry = entries[i];
							if (entry.type === "message" && entry.message.role === "user") {
								entryId = entry.id;
								break;
							}
						}
					}

					// Fallback to tracked values from events
					if (!sessionFile) sessionFile = currentSessionFile;
					if (!entryId) entryId = currentEntryId;

					// Create the job with fork context if available
					const job = scheduler.add({
						name: taskName,
						schedule,
						message: params.message,
						deleteAfterRun: true,
						forkFrom:
							sessionFile && entryId
								? { sessionFile, entryId }
								: undefined,
					});

					const forkNote = job.forkFrom
						? " Task will continue from current conversation context."
						: " Task will run in a fresh session (no context available).";

					return {
						content: [
							{
								type: "text" as const,
								text: `✓ Scheduled task "${taskName}" to run ${delayDescription}.${forkNote}`,
							},
						],
						details: { jobId: job.jobId, runAt: schedule.at } as Record<string, unknown>,
					};
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to schedule task: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
						details: {},
					};
				}
			},
		});

		// Also register a command for users to list/cancel scheduled tasks
		pi.registerCommand("tasks", {
			description: "List or cancel scheduled tasks: /tasks [cancel <jobId>]",
			handler: async (args, ctx) => {
				if (!scheduler) {
					ctx.ui.notify("Scheduler is not running.", "warning");
					return;
				}

				const trimmed = args.trim();

				if (trimmed.startsWith("cancel ")) {
					const jobId = trimmed.slice(7).trim();
					const removed = scheduler.remove(jobId);
					ctx.ui.notify(
						removed ? `✓ Cancelled task ${jobId}` : `Task not found: ${jobId}`,
						removed ? "info" : "warning",
					);
					return;
				}

				const jobs = scheduler.list();
				const scheduledTasks = jobs.filter((j) => j.forkFrom !== undefined || j.deleteAfterRun);

				if (scheduledTasks.length === 0) {
					ctx.ui.notify("No scheduled tasks.", "info");
					return;
				}

				const lines = scheduledTasks.map((job) => {
					const status = job.running ? "🔄 running" : job.enabled ? "⏳ pending" : "⏸ disabled";
					const schedule =
						job.schedule.kind === "at"
							? new Date(job.schedule.at).toLocaleString()
							: job.schedule.kind === "every"
								? `every ${formatDelay(job.schedule.intervalMs)}`
								: job.schedule.expression;
					return `${status} ${job.name} (${job.jobId.slice(0, 8)})\n   ${schedule}`;
				});

				ctx.ui.notify(`Scheduled tasks:\n\n${lines.join("\n\n")}`, "info");
			},
		});
	};
}

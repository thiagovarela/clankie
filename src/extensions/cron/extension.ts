import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { CronScheduler } from "./scheduler.ts";
import type { CronSchedule } from "./types.ts";

let scheduler: CronScheduler | null = null;

export function setCronScheduler(value: CronScheduler | null): void {
	scheduler = value;
}

const CronParamsSchema = Type.Object({
	action: StringEnum(["list", "add", "update", "remove", "enable", "disable", "run"] as const),
	jobId: Type.Optional(Type.String({ description: "Job ID for update/remove/enable/disable/run" })),
	name: Type.Optional(Type.String({ description: "Human-readable name" })),
	message: Type.Optional(Type.String({ description: "Prompt sent when the job runs" })),
	scheduleKind: Type.Optional(StringEnum(["at", "every", "cron"] as const)),
	at: Type.Optional(Type.String({ description: "ISO timestamp for one-shot schedule" })),
	intervalMs: Type.Optional(Type.Number({ description: "Interval in milliseconds for every schedule" })),
	cron: Type.Optional(Type.String({ description: "Cron expression for cron schedule" })),
	tz: Type.Optional(Type.String({ description: "IANA timezone for cron schedule" })),
	deliveryChannel: Type.Optional(Type.String({ description: "Target channel (e.g. web)" })),
	deliveryChatId: Type.Optional(Type.String({ description: "Target chat/channel ID" })),
	deliveryThreadId: Type.Optional(Type.String({ description: "Optional thread ID" })),
	deleteAfterRun: Type.Optional(Type.Boolean({ description: "Delete one-shot jobs after success" })),
	enabled: Type.Optional(Type.Boolean({ description: "Enable/disable in update action" })),
});

type CronParams = {
	action: "list" | "add" | "update" | "remove" | "enable" | "disable" | "run";
	jobId?: string;
	name?: string;
	message?: string;
	scheduleKind?: "at" | "every" | "cron";
	at?: string;
	intervalMs?: number;
	cron?: string;
	tz?: string;
	deliveryChannel?: string;
	deliveryChatId?: string;
	deliveryThreadId?: string;
	deleteAfterRun?: boolean;
	enabled?: boolean;
};

function parseSchedule(params: CronParams): CronSchedule | undefined {
	if (!params.scheduleKind) return undefined;
	switch (params.scheduleKind) {
		case "at":
			if (!params.at) throw new Error("Missing at timestamp for scheduleKind=at");
			return { kind: "at", at: params.at };
		case "every":
			if (params.intervalMs === undefined) throw new Error("Missing intervalMs for scheduleKind=every");
			return { kind: "every", intervalMs: params.intervalMs };
		case "cron":
			if (!params.cron) throw new Error("Missing cron expression for scheduleKind=cron");
			return { kind: "cron", expression: params.cron, tz: params.tz };
	}
}

export function createCronExtension() {
	return function cronExtension(pi: ExtensionAPI) {
		pi.on("before_agent_start", async (event) => {
			const now = new Date();
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const local = now.toLocaleString("sv-SE", { timeZone: timezone, hour12: false }).replace(" ", "T");
			return {
				systemPrompt:
					`${event.systemPrompt}\n\n` +
					`You can manage scheduled tasks with the cron tool.\n` +
					`Current UTC time: ${now.toISOString()}\n` +
					`Current timezone: ${timezone} (local: ${local})\n\n` +
					`When creating cron jobs that should notify the user of results, ` +
					`set deliveryChannel to "web" and deliveryChatId to the user's chat ID (use "default" if unsure). ` +
					`This ensures the LLM response is delivered as a web notification.`,
			};
		});

		pi.registerTool({
			name: "cron",
			label: "Cron",
			description: "Manage scheduled jobs. Actions: list, add, update, remove, enable, disable, run.",
			parameters: CronParamsSchema,
			async execute(_toolCallId, rawParams) {
				const params = rawParams as CronParams;

				if (!scheduler) {
					return { content: [{ type: "text" as const, text: "Cron scheduler is not running." }], details: {} };
				}

				try {
					switch (params.action) {
						case "list":
							return {
								content: [{ type: "text" as const, text: JSON.stringify(scheduler.list(), null, 2) }],
								details: {},
							};
						case "add": {
							if (!params.name || !params.message) {
								throw new Error("add requires name and message");
							}
							const schedule = parseSchedule(params);
							if (!schedule) throw new Error("add requires scheduleKind and schedule details");
							const job = scheduler.add({
								name: params.name,
								schedule,
								message: params.message,
								delivery:
									params.deliveryChannel && params.deliveryChatId
										? {
												channel: params.deliveryChannel,
												chatId: params.deliveryChatId,
												threadId: params.deliveryThreadId,
											}
										: undefined,
								deleteAfterRun: params.deleteAfterRun,
							});
							return {
								content: [{ type: "text" as const, text: `Added cron job ${job.name} (${job.jobId})` }],
								details: {},
							};
						}
						case "update": {
							if (!params.jobId) throw new Error("update requires jobId");
							const schedule = parseSchedule(params);
							const job = scheduler.update(params.jobId, {
								name: params.name,
								message: params.message,
								schedule,
								enabled: params.enabled,
								deleteAfterRun: params.deleteAfterRun,
								delivery:
									params.deliveryChannel && params.deliveryChatId
										? {
												channel: params.deliveryChannel,
												chatId: params.deliveryChatId,
												threadId: params.deliveryThreadId,
											}
										: undefined,
							});
							if (!job) throw new Error(`Job not found: ${params.jobId}`);
							return {
								content: [{ type: "text" as const, text: `Updated cron job ${job.name} (${job.jobId})` }],
								details: {},
							};
						}
						case "remove": {
							if (!params.jobId) throw new Error("remove requires jobId");
							const ok = scheduler.remove(params.jobId);
							return {
								content: [
									{ type: "text" as const, text: ok ? `Removed ${params.jobId}` : `Not found ${params.jobId}` },
								],
								details: {},
							};
						}
						case "enable": {
							if (!params.jobId) throw new Error("enable requires jobId");
							const job = scheduler.enable(params.jobId);
							return {
								content: [{ type: "text" as const, text: job ? `Enabled ${job.jobId}` : `Not found ${params.jobId}` }],
								details: {},
							};
						}
						case "disable": {
							if (!params.jobId) throw new Error("disable requires jobId");
							const job = scheduler.disable(params.jobId);
							return {
								content: [{ type: "text" as const, text: job ? `Disabled ${job.jobId}` : `Not found ${params.jobId}` }],
								details: {},
							};
						}
						case "run": {
							if (!params.jobId) throw new Error("run requires jobId");
							return {
								content: [{ type: "text" as const, text: scheduler.runNow(params.jobId) }],
								details: {},
							};
						}
					}
				} catch (err) {
					return {
						content: [
							{ type: "text" as const, text: `Cron error: ${err instanceof Error ? err.message : String(err)}` },
						],
						details: {},
					};
				}
			},
		});
	};
}

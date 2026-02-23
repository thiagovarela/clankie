/**
 * lil cron extension
 *
 * Provides tools for the agent to schedule one-time reminders and recurring tasks.
 * Jobs are stored in ~/.lil/cron/jobs.json and executed by the daemon's heartbeat loop.
 *
 * Tools:
 *   - cron_add      — Schedule a new job (one-time or recurring)
 *   - cron_list     — List all scheduled jobs
 *   - cron_remove   — Remove a job by ID
 *   - cron_update   — Update an existing job
 *
 * Job storage:
 *   ~/.lil/cron/jobs.json — Array of CronJob objects, managed atomically.
 *
 * The daemon reads this file and triggers jobs when they're due.
 * This extension only manages the job definitions — execution is in the daemon.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CronJob {
	/** Unique job ID (short random hex) */
	id: string;
	/** Human-readable description of what to do */
	description: string;
	/** The prompt to send to the agent when the job triggers */
	prompt: string;
	/** Schedule type */
	type: "once" | "recurring";
	/**
	 * For "once": ISO 8601 datetime string (when to fire)
	 * For "recurring": cron expression (minute hour day month weekday)
	 *   OR interval shorthand like "every 30m", "every 2h", "every 1d"
	 */
	schedule: string;
	/** When this job was created (ISO 8601) */
	createdAt: string;
	/** When this job last ran (ISO 8601), or null */
	lastRun: string | null;
	/** Next scheduled run (ISO 8601), or null if completed/disabled */
	nextRun: string | null;
	/** Whether the job is active */
	enabled: boolean;
	/** For one-time jobs: whether it has fired */
	completed: boolean;
	/** Optional: channel to deliver results to (overrides default) */
	channel?: string;
}

// ─── Storage helpers ───────────────────────────────────────────────────────────

const CRON_DIR = join(homedir(), ".lil", "cron");
const JOBS_FILE = join(CRON_DIR, "jobs.json");

function ensureCronDir(): void {
	if (!existsSync(CRON_DIR)) {
		mkdirSync(CRON_DIR, { recursive: true, mode: 0o700 });
	}
}

export function loadJobs(): CronJob[] {
	if (!existsSync(JOBS_FILE)) return [];
	try {
		const raw = readFileSync(JOBS_FILE, "utf-8");
		return JSON.parse(raw) as CronJob[];
	} catch {
		return [];
	}
}

export function saveJobs(jobs: CronJob[]): void {
	ensureCronDir();
	// Atomic write: write to tmp then rename
	const tmpFile = `${JOBS_FILE}.tmp`;
	writeFileSync(tmpFile, JSON.stringify(jobs, null, 2), "utf-8");
	const { renameSync } = require("node:fs");
	renameSync(tmpFile, JOBS_FILE);
}

function generateId(): string {
	return randomBytes(4).toString("hex"); // 8 chars
}

// ─── Schedule parsing ──────────────────────────────────────────────────────────

/**
 * Parse a human-friendly schedule into a normalized form.
 * Supports:
 *   - "in 10m", "in 2h", "in 1d" → one-time, relative
 *   - "2026-02-20T15:30:00" → one-time, absolute
 *   - "every 30m", "every 2h", "every 1d" → recurring interval
 *   - "0 9 * * *" → cron expression
 *   - "daily at 9:00", "weekdays at 8:30" → common patterns
 */
function parseSchedule(schedule: string): { type: "once" | "recurring"; schedule: string; nextRun: string } {
	const now = new Date();

	// Relative one-time: "in 10m", "in 2h", "in 1d"
	const relativeMatch = schedule.match(/^in\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/i);
	if (relativeMatch) {
		const amount = parseInt(relativeMatch[1], 10);
		const unit = relativeMatch[2].toLowerCase();
		const ms = unit.startsWith("m") ? amount * 60_000 : unit.startsWith("h") ? amount * 3_600_000 : amount * 86_400_000;
		const fireAt = new Date(now.getTime() + ms);
		return {
			type: "once",
			schedule: fireAt.toISOString(),
			nextRun: fireAt.toISOString(),
		};
	}

	// Absolute one-time: ISO date
	if (/^\d{4}-\d{2}-\d{2}/.test(schedule)) {
		const fireAt = new Date(schedule);
		if (Number.isNaN(fireAt.getTime())) {
			throw new Error(`Invalid date: ${schedule}`);
		}
		return {
			type: "once",
			schedule: fireAt.toISOString(),
			nextRun: fireAt.toISOString(),
		};
	}

	// Recurring interval: "every 30m", "every 2h", "every 1d"
	const intervalMatch = schedule.match(/^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/i);
	if (intervalMatch) {
		const amount = parseInt(intervalMatch[1], 10);
		const unit = intervalMatch[2].toLowerCase();
		const ms = unit.startsWith("m") ? amount * 60_000 : unit.startsWith("h") ? amount * 3_600_000 : amount * 86_400_000;
		const nextRun = new Date(now.getTime() + ms);
		return {
			type: "recurring",
			schedule: schedule,
			nextRun: nextRun.toISOString(),
		};
	}

	// Daily at time: "daily at 9:00", "daily at 14:30"
	const dailyMatch = schedule.match(/^daily\s+at\s+(\d{1,2}):(\d{2})$/i);
	if (dailyMatch) {
		const hour = parseInt(dailyMatch[1], 10);
		const minute = parseInt(dailyMatch[2], 10);
		const nextRun = getNextOccurrence(hour, minute);
		return {
			type: "recurring",
			schedule: `${minute} ${hour} * * *`,
			nextRun: nextRun.toISOString(),
		};
	}

	// Weekdays at time: "weekdays at 8:30"
	const weekdayMatch = schedule.match(/^weekdays\s+at\s+(\d{1,2}):(\d{2})$/i);
	if (weekdayMatch) {
		const hour = parseInt(weekdayMatch[1], 10);
		const minute = parseInt(weekdayMatch[2], 10);
		const nextRun = getNextWeekdayOccurrence(hour, minute);
		return {
			type: "recurring",
			schedule: `${minute} ${hour} * * 1-5`,
			nextRun: nextRun.toISOString(),
		};
	}

	// Raw cron expression (5 fields)
	if (/^[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+$/.test(schedule.trim())) {
		const nextRun = getNextCronRun(schedule.trim());
		return {
			type: "recurring",
			schedule: schedule.trim(),
			nextRun: nextRun.toISOString(),
		};
	}

	throw new Error(
		`Could not parse schedule: "${schedule}". ` +
			`Try: "in 10m", "every 2h", "daily at 9:00", or a cron expression like "0 9 * * *".`,
	);
}

/** Get next occurrence of a daily time (today if in future, otherwise tomorrow) */
function getNextOccurrence(hour: number, minute: number): Date {
	const now = new Date();
	const today = new Date(now);
	today.setHours(hour, minute, 0, 0);

	if (today > now) return today;

	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);
	return tomorrow;
}

/** Get next weekday occurrence of a time */
function getNextWeekdayOccurrence(hour: number, minute: number): Date {
	const now = new Date();
	const candidate = new Date(now);
	candidate.setHours(hour, minute, 0, 0);

	// If today is a weekday and the time is in the future, use today
	if (candidate > now && candidate.getDay() >= 1 && candidate.getDay() <= 5) {
		return candidate;
	}

	// Find next weekday
	candidate.setDate(candidate.getDate() + 1);
	while (candidate.getDay() === 0 || candidate.getDay() === 6) {
		candidate.setDate(candidate.getDate() + 1);
	}
	candidate.setHours(hour, minute, 0, 0);
	return candidate;
}

/** Simple next-run calculator for cron expressions. Handles basic cases. */
function getNextCronRun(cron: string): Date {
	const [minF, hourF, domF, monF, dowF] = cron.split(/\s+/);
	const now = new Date();

	// Try each minute for up to 7 days
	const candidate = new Date(now);
	candidate.setSeconds(0, 0);
	candidate.setMinutes(candidate.getMinutes() + 1);

	for (let i = 0; i < 7 * 24 * 60; i++) {
		if (
			matchField(minF, candidate.getMinutes()) &&
			matchField(hourF, candidate.getHours()) &&
			matchField(domF, candidate.getDate()) &&
			matchField(monF, candidate.getMonth() + 1) &&
			matchField(dowF, candidate.getDay())
		) {
			return candidate;
		}
		candidate.setMinutes(candidate.getMinutes() + 1);
	}

	// Fallback: 1 hour from now
	return new Date(now.getTime() + 3_600_000);
}

/** Match a cron field value. Supports *, specific numbers, ranges, lists, and steps. */
function matchField(field: string, value: number): boolean {
	if (field === "*") return true;

	// Comma-separated list
	const parts = field.split(",");
	for (const part of parts) {
		// Step: */5 or 1-10/2
		const stepMatch = part.match(/^(\*|\d+-\d+)\/(\d+)$/);
		if (stepMatch) {
			const step = parseInt(stepMatch[2], 10);
			if (stepMatch[1] === "*") {
				if (value % step === 0) return true;
			} else {
				const [start, end] = stepMatch[1].split("-").map(Number);
				if (value >= start && value <= end && (value - start) % step === 0) return true;
			}
			continue;
		}

		// Range: 1-5
		const rangeMatch = part.match(/^(\d+)-(\d+)$/);
		if (rangeMatch) {
			const [start, end] = [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
			if (value >= start && value <= end) return true;
			continue;
		}

		// Exact number
		if (parseInt(part, 10) === value) return true;
	}

	return false;
}

/**
 * Calculate next run for a recurring job based on its schedule string.
 * Exported for use by the heartbeat service.
 */
export function calculateNextRun(schedule: string): Date {
	// Interval: "every 30m", "every 2h", "every 1d"
	const intervalMatch = schedule.match(/^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/i);
	if (intervalMatch) {
		const amount = parseInt(intervalMatch[1], 10);
		const unit = intervalMatch[2].toLowerCase();
		const ms = unit.startsWith("m") ? amount * 60_000 : unit.startsWith("h") ? amount * 3_600_000 : amount * 86_400_000;
		return new Date(Date.now() + ms);
	}

	// Cron expression
	if (/^[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+\s+[\d*,/-]+$/.test(schedule.trim())) {
		return getNextCronRun(schedule.trim());
	}

	// Fallback: 1 hour
	return new Date(Date.now() + 3_600_000);
}

// ─── Extension ─────────────────────────────────────────────────────────────────

export default function cronExtension(pi: ExtensionAPI) {
	// ─── cron_add — schedule a new job ────────────────────────────────────────

	pi.registerTool({
		name: "cron_add",
		label: "Schedule Task",
		description:
			"Schedule a one-time reminder or recurring task. The daemon will execute the " +
			"task when it's due and send results to the user.\n\n" +
			"Schedule formats:\n" +
			'- One-time relative: "in 10m", "in 2h", "in 1d"\n' +
			'- One-time absolute: "2026-02-20T15:30:00"\n' +
			'- Recurring interval: "every 30m", "every 2h", "every 1d"\n' +
			'- Daily: "daily at 9:00", "daily at 14:30"\n' +
			'- Weekdays: "weekdays at 8:30"\n' +
			'- Cron expression: "0 9 * * *" (9am daily), "0 */2 * * *" (every 2 hours)\n\n' +
			"Examples:\n" +
			'  schedule: "in 10m", prompt: "Remind me to check the oven"\n' +
			'  schedule: "daily at 9:00", prompt: "Check email and summarize important messages"\n' +
			'  schedule: "every 2h", prompt: "Check server status and report any issues"',
		parameters: Type.Object({
			description: Type.String({
				description: "Brief description of the task (shown in cron_list)",
			}),
			prompt: Type.String({
				description:
					"The prompt that will be sent to the agent when the job triggers. " +
					"Be specific about what to do and how to report results.",
			}),
			schedule: Type.String({
				description: 'When to run. Examples: "in 10m", "every 2h", "daily at 9:00", "0 9 * * 1-5"',
			}),
		}),
		async execute(_toolCallId, params) {
			try {
				const parsed = parseSchedule(params.schedule);
				const job: CronJob = {
					id: generateId(),
					description: params.description,
					prompt: params.prompt,
					type: parsed.type,
					schedule: parsed.schedule,
					createdAt: new Date().toISOString(),
					lastRun: null,
					nextRun: parsed.nextRun,
					enabled: true,
					completed: false,
				};

				const jobs = loadJobs();
				jobs.push(job);
				saveJobs(jobs);

				const typeLabel = job.type === "once" ? "One-time" : "Recurring";
				const nextStr = job.nextRun ? new Date(job.nextRun).toLocaleString() : "unknown";

				return {
					content: [
						{
							type: "text" as const,
							text:
								`✓ Scheduled ${typeLabel.toLowerCase()} task: "${job.description}"\n` +
								`  ID: ${job.id}\n` +
								`  Next run: ${nextStr}\n` +
								`  Schedule: ${job.schedule}`,
						},
					],
					details: { id: job.id, type: job.type, nextRun: job.nextRun },
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error scheduling task: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					details: {},
					isError: true,
				};
			}
		},
	});

	// ─── cron_list — list all jobs ────────────────────────────────────────────

	pi.registerTool({
		name: "cron_list",
		label: "List Scheduled Tasks",
		description: "Show all scheduled tasks (active and completed).",
		parameters: Type.Object({
			showCompleted: Type.Optional(Type.Boolean({ description: "Include completed one-time jobs (default: false)" })),
		}),
		async execute(_toolCallId, params) {
			const jobs = loadJobs();
			const filtered = params.showCompleted ? jobs : jobs.filter((j) => !j.completed);

			if (filtered.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No scheduled tasks." }],
					details: { total: 0 },
				};
			}

			const lines = filtered.map((j) => {
				const status = j.completed ? "✓ done" : j.enabled ? "● active" : "○ paused";
				const nextStr = j.nextRun ? new Date(j.nextRun).toLocaleString() : "—";
				const typeLabel = j.type === "once" ? "once" : "recurring";
				return (
					`${status}  ${j.id}  [${typeLabel}]\n` +
					`         ${j.description}\n` +
					`         schedule: ${j.schedule}  |  next: ${nextStr}`
				);
			});

			return {
				content: [
					{
						type: "text" as const,
						text: `Scheduled tasks (${filtered.length}):\n\n${lines.join("\n\n")}`,
					},
				],
				details: { total: filtered.length },
			};
		},
	});

	// ─── cron_remove — remove a job ───────────────────────────────────────────

	pi.registerTool({
		name: "cron_remove",
		label: "Remove Scheduled Task",
		description: "Remove a scheduled task by its ID. Use cron_list to find IDs.",
		parameters: Type.Object({
			id: Type.String({ description: "Job ID to remove" }),
		}),
		async execute(_toolCallId, params) {
			const jobs = loadJobs();
			const idx = jobs.findIndex((j) => j.id === params.id);

			if (idx === -1) {
				return {
					content: [{ type: "text" as const, text: `No job found with ID "${params.id}".` }],
					details: { found: false },
					isError: true,
				};
			}

			const removed = jobs.splice(idx, 1)[0];
			saveJobs(jobs);

			return {
				content: [
					{
						type: "text" as const,
						text: `✓ Removed task: "${removed.description}" (${removed.id})`,
					},
				],
				details: { id: removed.id, description: removed.description },
			};
		},
	});

	// ─── cron_update — update a job ───────────────────────────────────────────

	pi.registerTool({
		name: "cron_update",
		label: "Update Scheduled Task",
		description:
			"Update an existing scheduled task. You can change its description, prompt, " +
			"schedule, or enabled state. Use cron_list to find IDs.",
		parameters: Type.Object({
			id: Type.String({ description: "Job ID to update" }),
			description: Type.Optional(Type.String({ description: "New description" })),
			prompt: Type.Optional(Type.String({ description: "New prompt" })),
			schedule: Type.Optional(Type.String({ description: "New schedule" })),
			enabled: Type.Optional(Type.Boolean({ description: "Enable or disable the job" })),
		}),
		async execute(_toolCallId, params) {
			const jobs = loadJobs();
			const job = jobs.find((j) => j.id === params.id);

			if (!job) {
				return {
					content: [{ type: "text" as const, text: `No job found with ID "${params.id}".` }],
					details: { found: false },
					isError: true,
				};
			}

			const changes: string[] = [];

			if (params.description !== undefined) {
				job.description = params.description;
				changes.push("description");
			}
			if (params.prompt !== undefined) {
				job.prompt = params.prompt;
				changes.push("prompt");
			}
			if (params.enabled !== undefined) {
				job.enabled = params.enabled;
				changes.push(params.enabled ? "enabled" : "disabled");
			}
			if (params.schedule !== undefined) {
				try {
					const parsed = parseSchedule(params.schedule);
					job.type = parsed.type;
					job.schedule = parsed.schedule;
					job.nextRun = parsed.nextRun;
					job.completed = false;
					changes.push("schedule");
				} catch (err) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error parsing schedule: ${err instanceof Error ? err.message : String(err)}`,
							},
						],
						details: {},
						isError: true,
					};
				}
			}

			saveJobs(jobs);

			return {
				content: [
					{
						type: "text" as const,
						text: `✓ Updated task "${job.description}" (${job.id}): ${changes.join(", ")}`,
					},
				],
				details: { id: job.id, changes },
			};
		},
	});
}

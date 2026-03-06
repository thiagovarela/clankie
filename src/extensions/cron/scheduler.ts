import { randomUUID } from "node:crypto";
import { Cron } from "croner";
import { createSession } from "../../agent.ts";
import { createNotification } from "../../notifications.ts";
import { acquireCronLock, releaseCronLock } from "./lock.ts";
import { ensureJobsFile, loadJobs, saveJobs } from "./storage.ts";
import type { CronDeliveryTarget, CronJob, CronListItem, CronSchedule } from "./types.ts";

const DEFAULT_TICK_MS = 30_000;
const JOB_TIMEOUT_MS = 5 * 60_000;

export interface CronSchedulerOptions {
	tickIntervalMs?: number;
	onDeliver: (delivery: CronDeliveryTarget, text: string) => Promise<void>;
}

export interface CronCreateJobInput {
	name: string;
	schedule: CronSchedule;
	message: string;
	delivery?: CronDeliveryTarget;
	deleteAfterRun?: boolean;
}

export interface CronUpdateJobInput {
	name?: string;
	schedule?: CronSchedule;
	message?: string;
	delivery?: CronDeliveryTarget;
	enabled?: boolean;
	deleteAfterRun?: boolean;
}

export class CronScheduler {
	private jobs: CronJob[] = [];
	private running = new Set<string>();
	private timer: ReturnType<typeof setInterval> | null = null;
	private tickIntervalMs: number;
	private lastTickMinute = "";
	private readonly onDeliver: (delivery: CronDeliveryTarget, text: string) => Promise<void>;
	private locked = false;

	constructor(options: CronSchedulerOptions) {
		this.tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_MS;
		this.onDeliver = options.onDeliver;
	}

	start(): boolean {
		if (this.timer) return true;
		if (!acquireCronLock()) {
			return false;
		}
		this.locked = true;
		this.reload();
		this.tick();
		this.timer = setInterval(() => this.tick(), this.tickIntervalMs);
		return true;
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (this.locked) {
			releaseCronLock();
			this.locked = false;
		}
	}

	reload(): void {
		ensureJobsFile();
		this.jobs = loadJobs();
	}

	list(): CronListItem[] {
		return this.jobs.map((job) => ({ ...job, running: this.running.has(job.jobId) }));
	}

	get(jobId: string): CronJob | undefined {
		return this.jobs.find((job) => job.jobId === jobId);
	}

	add(input: CronCreateJobInput): CronJob {
		this.validateSchedule(input.schedule);
		const createdAt = new Date().toISOString();
		const job: CronJob = {
			jobId: randomUUID(),
			name: input.name,
			enabled: true,
			schedule: input.schedule,
			message: input.message,
			delivery: input.delivery,
			deleteAfterRun: input.deleteAfterRun ?? input.schedule.kind === "at",
			createdAt,
			consecutiveFailures: 0,
		};
		this.jobs.push(job);
		this.persist();
		return job;
	}

	update(jobId: string, patch: CronUpdateJobInput): CronJob | undefined {
		const job = this.jobs.find((entry) => entry.jobId === jobId);
		if (!job) return undefined;
		if (patch.schedule) {
			this.validateSchedule(patch.schedule);
			job.schedule = patch.schedule;
		}
		if (patch.name !== undefined) job.name = patch.name;
		if (patch.message !== undefined) job.message = patch.message;
		if (patch.delivery !== undefined) job.delivery = patch.delivery;
		if (patch.enabled !== undefined) job.enabled = patch.enabled;
		if (patch.deleteAfterRun !== undefined) job.deleteAfterRun = patch.deleteAfterRun;
		this.persist();
		return job;
	}

	remove(jobId: string): boolean {
		const before = this.jobs.length;
		this.jobs = this.jobs.filter((job) => job.jobId !== jobId);
		if (this.jobs.length === before) return false;
		this.persist();
		return true;
	}

	enable(jobId: string): CronJob | undefined {
		return this.update(jobId, { enabled: true });
	}

	disable(jobId: string): CronJob | undefined {
		return this.update(jobId, { enabled: false });
	}

	runNow(jobId: string): string {
		const job = this.jobs.find((entry) => entry.jobId === jobId);
		if (!job) return `Job ${jobId} not found.`;
		if (!job.enabled) return `Job ${jobId} is disabled.`;
		if (this.running.has(job.jobId)) return `Job ${jobId} is already running.`;
		this.running.add(job.jobId);
		void this.execute(job).finally(() => {
			this.running.delete(job.jobId);
		});
		return `Triggered ${job.name}.`;
	}

	private persist(): void {
		saveJobs(this.jobs);
	}

	private tick(): void {
		const now = new Date();
		const minuteKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
		if (minuteKey === this.lastTickMinute) return;
		this.lastTickMinute = minuteKey;

		for (const job of this.jobs) {
			if (!job.enabled || this.running.has(job.jobId)) continue;
			if (!this.isDue(job, now)) continue;
			this.running.add(job.jobId);
			void this.execute(job).finally(() => {
				this.running.delete(job.jobId);
			});
		}
	}

	private isDue(job: CronJob, now: Date): boolean {
		switch (job.schedule.kind) {
			case "at":
				return now.getTime() >= Date.parse(job.schedule.at) && !job.lastRunAt;
			case "every": {
				const from = job.lastRunAt ? Date.parse(job.lastRunAt) : Date.parse(job.createdAt);
				return now.getTime() >= from + job.schedule.intervalMs;
			}
			case "cron": {
				const baseDate = job.lastRunAt ? new Date(Date.parse(job.lastRunAt) + 1000) : new Date(now.getTime() - 60_000);
				const cron = new Cron(job.schedule.expression, { timezone: job.schedule.tz });
				const next = cron.nextRun(baseDate);
				return !!next && next.getTime() <= now.getTime();
			}
		}
	}

	private async execute(job: CronJob): Promise<void> {
		const timeout = setTimeout(() => {
			console.warn(`[cron] Job timed out: ${job.name} (${job.jobId})`);
		}, JOB_TIMEOUT_MS);

		try {
			const { session } = await createSession({ ephemeral: true });
			const prompt = `[cron:${job.jobId} ${job.name}]\n${job.message}`;
			await session.prompt(prompt, { source: "rpc" });

			const state = session.state;
			const lastMessage = state.messages[state.messages.length - 1];
			let response = "(No text response)";
			if (lastMessage?.role === "assistant") {
				const text = lastMessage.content
					.filter((entry) => entry.type === "text")
					.map((entry) => entry.text)
					.join("\n")
					.trim();
				if (text) response = text;
			}

			if (job.delivery) {
				await this.onDeliver(job.delivery, response);
			}

			job.lastRunAt = new Date().toISOString();
			job.consecutiveFailures = 0;

			if (job.schedule.kind === "at" && job.deleteAfterRun) {
				this.jobs = this.jobs.filter((entry) => entry.jobId !== job.jobId);
			}

			this.persist();
		} catch (err) {
			job.consecutiveFailures += 1;
			const errorMessage = err instanceof Error ? err.message : String(err);
			
			// Create notification for job failure
			createNotification({
				type: "error",
				source: "cron",
				title: `Cron job failed: ${job.name}`,
				message: errorMessage,
				dedupKey: `cron-fail-${job.jobId}`,
				metadata: {
					dedupKey: `cron-fail-${job.jobId}`,
					jobId: job.jobId,
					jobName: job.name,
					consecutiveFailures: job.consecutiveFailures,
					error: errorMessage,
				},
			});
			
			if (job.consecutiveFailures >= 5) {
				job.enabled = false;
				// Create notification for auto-disabled job
				createNotification({
					type: "warning",
					source: "cron",
					title: `Cron job disabled: ${job.name}`,
					message: `Job "${job.name}" was automatically disabled after 5 consecutive failures.`,
					metadata: {
						jobId: job.jobId,
						jobName: job.name,
						consecutiveFailures: job.consecutiveFailures,
						autoDisabled: true,
					},
				});
			}
			this.persist();
			console.error(`[cron] Job failed (${job.name}):`, err);
		} finally {
			clearTimeout(timeout);
		}
	}

	private validateSchedule(schedule: CronSchedule): void {
		switch (schedule.kind) {
			case "at": {
				const parsed = Date.parse(schedule.at);
				if (Number.isNaN(parsed)) throw new Error(`Invalid at timestamp: ${schedule.at}`);
				break;
			}
			case "every":
				if (!Number.isFinite(schedule.intervalMs) || schedule.intervalMs < 1000) {
					throw new Error("intervalMs must be >= 1000");
				}
				break;
			case "cron": {
				const cron = new Cron(schedule.expression, { timezone: schedule.tz });
				if (!cron.nextRun()) throw new Error(`Invalid cron expression: ${schedule.expression}`);
				break;
			}
		}
	}
}

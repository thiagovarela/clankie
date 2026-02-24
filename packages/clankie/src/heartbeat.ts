/**
 * clankie heartbeat service
 *
 * Periodically reads ~/.clankie/heartbeat.md and sends its contents as a prompt
 * to the agent. Results are delivered to the last active channel.
 *
 * Also checks cron jobs from ~/.clankie/cron/jobs.json and fires due jobs.
 *
 * Runs inside the daemon process. Configurable via clankie.json:
 *   heartbeat.enabled (default: true)
 *   heartbeat.intervalMinutes (default: 30, min: 5)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "./config.ts";
import { calculateNextRun, loadJobs, saveJobs } from "./extensions/cron/index.ts";

const MIN_INTERVAL_MINUTES = 5;
const DEFAULT_INTERVAL_MINUTES = 30;

const HEARTBEAT_FILE = join(homedir(), ".clankie", "heartbeat.md");

export type HeartbeatHandler = (prompt: string) => Promise<void>;

export class HeartbeatService {
	private intervalMs: number;
	private enabled: boolean;
	private timer: ReturnType<typeof setInterval> | null = null;
	private handler: HeartbeatHandler | null = null;

	constructor(config?: AppConfig) {
		const hb = config?.heartbeat;
		this.enabled = hb?.enabled !== false; // default: true

		let minutes = hb?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
		if (minutes < MIN_INTERVAL_MINUTES) minutes = MIN_INTERVAL_MINUTES;
		this.intervalMs = minutes * 60_000;
	}

	setHandler(handler: HeartbeatHandler): void {
		this.handler = handler;
	}

	start(): void {
		if (!this.enabled || this.timer) return;

		console.log(`[heartbeat] Started (interval: ${this.intervalMs / 60_000}m)`);

		// Run first check after a short delay
		setTimeout(() => this.tick(), 5_000);

		// Then on interval
		this.timer = setInterval(() => this.tick(), this.intervalMs);
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
			console.log("[heartbeat] Stopped");
		}
	}

	private async tick(): Promise<void> {
		if (!this.handler) return;

		// 1. Check heartbeat.md
		await this.executeHeartbeat();

		// 2. Check cron jobs
		await this.executeDueJobs();
	}

	// ─── Heartbeat file execution ─────────────────────────────────────

	private async executeHeartbeat(): Promise<void> {
		if (!this.handler) return;

		const prompt = this.buildHeartbeatPrompt();
		if (!prompt) return;

		try {
			await this.handler(prompt);
		} catch (err) {
			console.error(`[heartbeat] Error:`, err instanceof Error ? err.message : String(err));
		}
	}

	private buildHeartbeatPrompt(): string | null {
		if (!existsSync(HEARTBEAT_FILE)) {
			this.createDefaultHeartbeatFile();
			return null;
		}

		try {
			const content = readFileSync(HEARTBEAT_FILE, "utf-8").trim();
			if (!content) return null;

			const now = new Date().toISOString().replace("T", " ").slice(0, 19);
			return (
				`# Heartbeat Check\n\n` +
				`Current time: ${now}\n\n` +
				`You are a proactive AI assistant. This is a scheduled heartbeat check.\n` +
				`Review the following tasks and execute any necessary actions using available tools.\n` +
				`If there is nothing that requires attention, respond briefly with "All clear."\n\n` +
				content
			);
		} catch {
			return null;
		}
	}

	private createDefaultHeartbeatFile(): void {
		const content = `# Heartbeat Tasks

This file is checked periodically by clankie's heartbeat service.
Add tasks below — they'll be executed every ${this.intervalMs / 60_000} minutes.

## Instructions

- Execute ALL tasks listed below
- For quick tasks, respond directly
- For long-running tasks, note what you did
- If nothing needs attention, say "All clear"

---

Add your tasks below this line:
`;

		try {
			writeFileSync(HEARTBEAT_FILE, content, "utf-8");
			console.log("[heartbeat] Created default heartbeat.md");
		} catch {
			// Non-fatal
		}
	}

	// ─── Cron job execution ───────────────────────────────────────────

	private async executeDueJobs(): Promise<void> {
		if (!this.handler) return;

		const jobs = loadJobs();
		const now = new Date();
		let modified = false;

		for (const job of jobs) {
			if (!job.enabled || job.completed) continue;
			if (!job.nextRun) continue;

			const nextRun = new Date(job.nextRun);
			if (nextRun > now) continue;

			// Job is due — execute it
			console.log(`[heartbeat] Executing cron job: ${job.description} (${job.id})`);

			try {
				await this.handler(
					`# Scheduled Task\n\n` +
						`Task: ${job.description}\n` +
						`Job ID: ${job.id}\n` +
						`Schedule: ${job.schedule}\n\n` +
						job.prompt,
				);
			} catch (err) {
				console.error(`[heartbeat] Cron job ${job.id} failed:`, err instanceof Error ? err.message : String(err));
			}

			// Update job state
			job.lastRun = now.toISOString();

			if (job.type === "once") {
				job.completed = true;
				job.nextRun = null;
			} else {
				// Calculate next run for recurring jobs
				const next = calculateNextRun(job.schedule);
				job.nextRun = next.toISOString();
			}

			modified = true;
		}

		if (modified) {
			saveJobs(jobs);
		}
	}
}

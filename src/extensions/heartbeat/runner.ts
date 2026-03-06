import { join } from "node:path";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import { getAgentDir, getAppDir, getAuthPath, loadConfig } from "../../config.ts";
import { createNotification } from "../../notifications.ts";
import { createCronExtension } from "../cron/index.ts";
import { createWorkspaceJailExtension } from "../workspace-jail.ts";
import { acquireHeartbeatLock, releaseHeartbeatLock } from "./lock.ts";
import { buildPrompt, isEffectivelyEmpty, readHeartbeatMd } from "./prompt.ts";
import { resolveHeartbeatSettings } from "./settings.ts";
import { persistHeartbeatResult, resolveResultsDir } from "./storage.ts";
import type { HeartbeatParsedResponse, HeartbeatRunResult, HeartbeatSettings, HeartbeatStats } from "./types.ts";

const HEARTBEAT_OK = "HEARTBEAT_OK";

function parseDurationToMs(value: string): number {
	const trimmed = value.trim().toLowerCase();
	const match = trimmed.match(/^(\d+)\s*([mh])$/);
	if (!match) return 30 * 60_000;
	const amount = Number.parseInt(match[1], 10);
	if (!Number.isFinite(amount)) return 30 * 60_000;
	if (match[2] === "h") return amount * 60 * 60_000;
	return amount * 60_000;
}

function parseTimeOfDay(value: string): number | null {
	const match = value.match(/^(\d{2}):(\d{2})$/);
	if (!match) return null;
	const hour = Number.parseInt(match[1], 10);
	const minute = Number.parseInt(match[2], 10);
	if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
	if (hour < 0 || hour > 24) return null;
	if (minute < 0 || minute > 59) return null;
	if (hour === 24 && minute !== 0) return null;
	return hour * 60 + minute;
}

function getMinutesInTimezone(timezone?: string): number {
	if (!timezone) {
		const now = new Date();
		return now.getHours() * 60 + now.getMinutes();
	}

	const formatter = new Intl.DateTimeFormat("en-GB", {
		timeZone: timezone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	const parts = formatter.formatToParts(new Date());
	const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
	const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
	return hour * 60 + minute;
}

function isWithinActiveHours(settings: HeartbeatSettings): boolean {
	if (!settings.activeHours) return true;
	const start = parseTimeOfDay(settings.activeHours.start);
	const end = parseTimeOfDay(settings.activeHours.end);
	if (start === null || end === null || start === end) return false;

	const nowMinutes = getMinutesInTimezone(settings.activeHours.timezone);
	if (start < end) {
		return nowMinutes >= start && nowMinutes < end;
	}
	// Overnight window, e.g. 22:00 -> 06:00
	return nowMinutes >= start || nowMinutes < end;
}

function parseHeartbeatResponse(response: string, ackMaxChars: number): HeartbeatParsedResponse {
	const raw = response.trim();
	let normalized = raw;
	let ackMatched = false;

	if (normalized.startsWith(HEARTBEAT_OK)) {
		normalized = normalized.slice(HEARTBEAT_OK.length).trim();
		ackMatched = true;
	}
	if (normalized.endsWith(HEARTBEAT_OK)) {
		normalized = normalized.slice(0, -HEARTBEAT_OK.length).trim();
		ackMatched = true;
	}

	const ok = ackMatched && normalized.length <= ackMaxChars;
	return {
		ok,
		ackMatched,
		response: raw,
		normalizedResponse: normalized,
	};
}

interface HeartbeatRunnerOptions {
	cwd: string;
}

export class HeartbeatRunner {
	private readonly cwd: string;
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;
	private locked = false;
	private settings: HeartbeatSettings;
	private stats: HeartbeatStats = {
		active: false,
		running: false,
		runCount: 0,
		okCount: 0,
		alertCount: 0,
		lastRun: null,
		lastResult: null,
	};

	constructor(options: HeartbeatRunnerOptions) {
		this.cwd = options.cwd;
		this.settings = resolveHeartbeatSettings(this.cwd);
	}

	reloadSettings(): HeartbeatSettings {
		this.settings = resolveHeartbeatSettings(this.cwd);
		if (this.isActive()) {
			this.stop();
			if (this.settings.enabled) {
				this.start();
			}
		}
		return this.settings;
	}

	start(): boolean {
		if (this.timer) return true;
		this.settings = resolveHeartbeatSettings(this.cwd);
		const intervalMs = parseDurationToMs(this.settings.every);
		if (intervalMs <= 0) {
			return false;
		}
		if (!acquireHeartbeatLock()) {
			return false;
		}
		this.locked = true;
		this.stats.active = true;
		this.timer = setInterval(() => {
			void this.tick();
		}, intervalMs);
		return true;
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (this.locked) {
			releaseHeartbeatLock();
			this.locked = false;
		}
		this.stats.active = false;
	}

	isActive(): boolean {
		return this.timer !== null;
	}

	isRunning(): boolean {
		return this.running;
	}

	getStatus(): HeartbeatStats {
		return {
			...this.stats,
			running: this.running,
		};
	}

	getSettings(): HeartbeatSettings {
		return { ...this.settings };
	}

	async runNow(): Promise<HeartbeatRunResult> {
		this.settings = resolveHeartbeatSettings(this.cwd);
		return this.execute();
	}

	private async tick(): Promise<void> {
		if (this.running) return;
		if (!isWithinActiveHours(this.settings)) return;

		const heartbeatMd = readHeartbeatMd(this.cwd);
		if (heartbeatMd !== null && isEffectivelyEmpty(heartbeatMd)) {
			return;
		}

		await this.execute();
	}

	private async execute(): Promise<HeartbeatRunResult> {
		this.running = true;
		this.stats.running = true;
		const startedAt = Date.now();
		const timestamp = new Date(startedAt).toISOString();
		const runId = timestamp;
		const resultsDir = resolveResultsDir(this.cwd, this.settings.resultsDir);

		try {
			const prompt = buildPrompt(this.cwd, this.settings.prompt);
			const responseText = await this.runHeartbeatPrompt(prompt);
			const parsed = parseHeartbeatResponse(responseText, this.settings.ackMaxChars);

			const result: HeartbeatRunResult = {
				runId,
				timestamp,
				durationMs: Date.now() - startedAt,
				cwd: this.cwd,
				resultsDir,
				...parsed,
			};

			persistHeartbeatResult(result);
			this.recordResult(result);
			return result;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const result: HeartbeatRunResult = {
				runId,
				timestamp,
				durationMs: Date.now() - startedAt,
				cwd: this.cwd,
				resultsDir,
				ok: false,
				ackMatched: false,
				response: `Error: ${message}`,
				normalizedResponse: `Error: ${message}`,
				error: message,
			};
			persistHeartbeatResult(result);
			this.recordResult(result);
			return result;
		} finally {
			this.running = false;
			this.stats.running = false;
		}
	}

	private recordResult(result: HeartbeatRunResult): void {
		this.stats.lastRun = result.timestamp;
		this.stats.lastResult = result;
		this.stats.runCount += 1;
		if (result.ok) {
			this.stats.okCount += 1;
		} else {
			this.stats.alertCount += 1;
			// Create notification for heartbeat alert
			const message = result.error 
				? `Error: ${result.error}` 
				: result.normalizedResponse || "Heartbeat check failed";
			createNotification({
				type: result.error ? "error" : "warning",
				source: "heartbeat",
				title: "Heartbeat Alert",
				message,
				dedupKey: `heartbeat-${this.cwd}`,
				metadata: {
					dedupKey: `heartbeat-${this.cwd}`,
					ok: result.ok,
					error: result.error,
					timestamp: result.timestamp,
				},
			});
		}
	}

	private async runHeartbeatPrompt(prompt: string): Promise<string> {
		const config = loadConfig();
		const agentDir = getAgentDir(config);
		const authStorage = AuthStorage.create(getAuthPath());
		const modelRegistry = new ModelRegistry(authStorage);
		const cwd = this.cwd;

		const extensionFactories = [createCronExtension()];
		const restrictToWorkspace = config.agent?.restrictToWorkspace ?? true;
		if (restrictToWorkspace) {
			const configuredAllowedPaths = config.agent?.allowedPaths ?? [];
			const attachmentRoot = join(getAppDir(), "attachments");
			const allowedPaths = Array.from(new Set([...configuredAllowedPaths, attachmentRoot]));
			extensionFactories.push(createWorkspaceJailExtension(cwd, allowedPaths));
		}

		const loader = new DefaultResourceLoader({
			cwd,
			agentDir,
			extensionFactories,
		});
		await loader.reload();

		const configuredModelSpec = this.settings.model?.trim();
		const fallbackModelSpec = config.agent?.model?.primary;
		const modelSpec = configuredModelSpec || fallbackModelSpec;
		let model: ReturnType<ModelRegistry["find"]> | undefined;
		if (modelSpec) {
			const slash = modelSpec.indexOf("/");
			if (slash !== -1) {
				const provider = modelSpec.substring(0, slash);
				const modelId = modelSpec.substring(slash + 1);
				model = modelRegistry.find(provider, modelId);
			}
		}

		const { session } = await createAgentSession({
			cwd,
			agentDir,
			authStorage,
			modelRegistry,
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(),
			model,
		});

		try {
			await session.prompt(prompt, { source: "extension" });
			const state = session.state;
			const lastMessage = state.messages[state.messages.length - 1];
			if (!lastMessage || lastMessage.role !== "assistant") {
				return "";
			}

			const text = lastMessage.content
				.filter((content) => content.type === "text")
				.map((content) => content.text)
				.join("\n")
				.trim();
			return text;
		} finally {
			session.dispose();
		}
	}
}

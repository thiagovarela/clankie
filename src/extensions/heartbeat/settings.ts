import { homedir } from "node:os";
import { join } from "node:path";
import { SettingsManager } from "@mariozechner/pi-coding-agent";
import { getAgentDir, loadConfig } from "../../config.ts";
import type { HeartbeatSettings } from "./types.ts";

const DEFAULTS: HeartbeatSettings = {
	enabled: false,
	every: "30m",
	activeHours: null,
	prompt: null,
	ackMaxChars: 300,
	resultsDir: join(homedir(), ".clankie", "workspace", "heartbeat"),
	showOk: false,
	model: null,
};

function toRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

function parseNamespace(raw: Record<string, unknown>): Partial<HeartbeatSettings> {
	const activeHoursRaw = toRecord(raw.activeHours);

	return {
		enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
		every: typeof raw.every === "string" ? raw.every : typeof raw.interval === "string" ? raw.interval : undefined,
		activeHours:
			typeof activeHoursRaw.start === "string" && typeof activeHoursRaw.end === "string"
				? {
						start: activeHoursRaw.start,
						end: activeHoursRaw.end,
						timezone: typeof activeHoursRaw.timezone === "string" ? activeHoursRaw.timezone : undefined,
					}
				: activeHoursRaw === null
					? null
					: undefined,
		prompt: typeof raw.prompt === "string" ? raw.prompt : raw.prompt === null ? null : undefined,
		ackMaxChars: typeof raw.ackMaxChars === "number" ? raw.ackMaxChars : undefined,
		resultsDir: typeof raw.resultsDir === "string" ? raw.resultsDir : undefined,
		showOk: typeof raw.showOk === "boolean" ? raw.showOk : undefined,
		model: typeof raw.model === "string" ? raw.model : raw.model === null ? null : undefined,
	};
}

export function resolveHeartbeatSettings(cwd: string): HeartbeatSettings {
	try {
		const config = loadConfig();
		const agentDir = getAgentDir(config);
		const sm = SettingsManager.create(cwd, agentDir);
		const global = toRecord(sm.getGlobalSettings());
		const project = toRecord(sm.getProjectSettings());

		const globalRaw = {
			...toRecord(global.heartbeat),
			...toRecord(global["pi-heartbeat"]),
			...toRecord(global["clankie-heartbeat"]),
		};
		const projectRaw = {
			...toRecord(project.heartbeat),
			...toRecord(project["pi-heartbeat"]),
			...toRecord(project["clankie-heartbeat"]),
		};

		const merged = {
			...DEFAULTS,
			...parseNamespace(globalRaw),
			...parseNamespace(projectRaw),
		};

		return {
			...merged,
			ackMaxChars: Number.isFinite(merged.ackMaxChars) ? Math.max(0, Math.floor(merged.ackMaxChars)) : 300,
		};
	} catch {
		return { ...DEFAULTS };
	}
}

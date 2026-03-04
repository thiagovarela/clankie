import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

const PROJECT_SETTINGS_PATH = [".pi", "settings.json"] as const;

export interface HeartbeatUiConfig {
	enabled: boolean;
	every: string;
	model: string | null;
}

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

/** Strip undefined values from an object so spread merges don't clobber defaults */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
	const result: Partial<T> = {};
	for (const key of Object.keys(obj) as (keyof T)[]) {
		if (obj[key] !== undefined) {
			result[key] = obj[key];
		}
	}
	return result;
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
			...stripUndefined(parseNamespace(globalRaw)),
			...stripUndefined(parseNamespace(projectRaw)),
		};

		return {
			...merged,
			ackMaxChars: Number.isFinite(merged.ackMaxChars) ? Math.max(0, Math.floor(merged.ackMaxChars)) : 300,
		};
	} catch {
		return { ...DEFAULTS };
	}
}

function getProjectSettingsPath(cwd: string): string {
	return join(cwd, ...PROJECT_SETTINGS_PATH);
}

function readProjectSettings(cwd: string): Record<string, unknown> {
	const settingsPath = getProjectSettingsPath(cwd);
	if (!existsSync(settingsPath)) {
		return {};
	}

	try {
		const content = readFileSync(settingsPath, "utf8");
		const parsed = JSON.parse(content);
		return toRecord(parsed);
	} catch {
		return {};
	}
}

function writeProjectSettings(cwd: string, settings: Record<string, unknown>): void {
	const settingsPath = getProjectSettingsPath(cwd);
	mkdirSync(dirname(settingsPath), { recursive: true });
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function normalizeEvery(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (!/^\d+\s*[mh]$/.test(normalized)) {
		throw new Error("Invalid heartbeat schedule. Use values like '15m' or '1h'.");
	}
	return normalized.replace(/\s+/g, "");
}

function normalizeModel(value: string | null | undefined): string | null {
	if (value == null) {
		return null;
	}
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	if (!/^[^/]+\/[^/]+$/.test(normalized)) {
		throw new Error("Invalid model format. Use 'provider/model'.");
	}
	return normalized;
}

export function getHeartbeatUiConfig(cwd: string): HeartbeatUiConfig {
	const settings = resolveHeartbeatSettings(cwd);
	return {
		enabled: settings.enabled,
		every: settings.every,
		model: settings.model,
	};
}

export function setHeartbeatUiConfig(cwd: string, config: HeartbeatUiConfig): HeartbeatUiConfig {
	const projectSettings = readProjectSettings(cwd);
	const currentNamespace = toRecord(projectSettings["clankie-heartbeat"]);

	const nextNamespace = {
		...currentNamespace,
		enabled: config.enabled,
		every: normalizeEvery(config.every),
		model: normalizeModel(config.model),
	};

	const nextProjectSettings = {
		...projectSettings,
		"clankie-heartbeat": nextNamespace,
	};

	writeProjectSettings(cwd, nextProjectSettings);
	return getHeartbeatUiConfig(cwd);
}

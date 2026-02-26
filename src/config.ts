/**
 * clankie configuration management
 *
 * Reads an optional JSON5 config from ~/.clankie/clankie.json (comments + trailing commas allowed).
 * Structure mirrors OpenClaw's ~/.openclaw/openclaw.json where applicable.
 *
 * Authentication credentials are managed by pi's AuthStorage
 * at ~/.pi/agent/auth.json — shared between `pi` and `clankie`.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import JSON5 from "json5";

// ─── Config types ────────────────────────────────────────────────────────────

export interface AppConfig {
	/** Agent runtime settings */
	agent?: {
		/** Working directory for the agent (default: ~/.clankie/workspace) */
		workspace?: string;
		/** Override for pi's agent dir (default: ~/.clankie) */
		agentDir?: string;
		/** Restrict agent to workspace directory (default: true) */
		restrictToWorkspace?: boolean;
		/** Additional paths outside workspace that are allowed (e.g. ["/tmp"]) */
		allowedPaths?: string[];
		/** Model configuration */
		model?: {
			/** Primary model in provider/model format (e.g. "anthropic/claude-sonnet-4-5") */
			primary?: string;
			/** Fallback models tried in order if primary fails */
			fallbacks?: string[];
		};
	};

	/** Channel configuration — each channel starts when its section exists */
	channels?: {
		slack?: {
			enabled?: boolean;
			/** App token from Slack app settings (xapp-...) */
			appToken?: string;
			/** Bot token from Slack app settings (xoxb-...) */
			botToken?: string;
			/** Allowed Slack user IDs */
			allowFrom?: string[];
			/** Allowed Slack channel IDs (empty = allow all) */
			allowedChannelIds?: string[];
		};
		web?: {
			enabled?: boolean;
			/** Port to listen on (default: 3100) */
			port?: number;
			/** Required shared secret for authentication */
			authToken?: string;
			/** Allowed origins for CORS-like validation (empty = allow all) */
			allowedOrigins?: string[];
			/** Path to built web-ui static files (enables same-origin serving) */
			staticDir?: string;
		};
	};
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const APP_DIR = join(homedir(), ".clankie");
const CONFIG_PATH = join(APP_DIR, "clankie.json");
/** Legacy path — migrated automatically */
const LEGACY_CONFIG_PATH = join(APP_DIR, "config.json");

/** Returns the path to the app's config directory, creating it if needed. */
export function getAppDir(): string {
	if (!existsSync(APP_DIR)) {
		mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
	}
	return APP_DIR;
}

/** Resolves the workspace directory, creating it if needed. */
export function getWorkspace(config?: AppConfig): string {
	const workspace = config?.agent?.workspace ?? join(homedir(), ".clankie", "workspace");
	const resolved = workspace.replace(/^~/, homedir());
	if (!existsSync(resolved)) {
		mkdirSync(resolved, { recursive: true, mode: 0o755 });
	}
	return resolved;
}

/** Resolves pi's agent directory (defaults to ~/.clankie to keep the app self-contained). */
export function getAgentDir(config?: AppConfig): string {
	return config?.agent?.agentDir ?? join(homedir(), ".clankie");
}

/** Returns the path to the app's auth file (~/.clankie/auth.json). */
export function getAuthPath(): string {
	return join(getAppDir(), "auth.json");
}

/** Path to the config file */
export function getConfigPath(): string {
	return CONFIG_PATH;
}

/**
 * Resolve the path to the bundled web-ui static files.
 * When installed via npm, these live at <package>/web-ui-dist/ alongside src/.
 * Returns the path if found, undefined otherwise.
 */
export function getBundledWebUiDir(): string | undefined {
	// import.meta.dirname → <package>/src/ at runtime (Node 21+)
	const packageRoot = join(import.meta.dirname, "..");
	const bundledDir = join(packageRoot, "web-ui-dist");
	if (existsSync(bundledDir) && existsSync(join(bundledDir, "_shell.html"))) {
		return bundledDir;
	}
	return undefined;
}

// ─── Loading & saving ─────────────────────────────────────────────────────────

/** Load config from ~/.clankie/clankie.json (JSON5). Returns empty config if missing. */
export function loadConfig(): AppConfig {
	getAppDir();

	// Auto-migrate legacy config.json → clankie.json
	if (!existsSync(CONFIG_PATH) && existsSync(LEGACY_CONFIG_PATH)) {
		migrateFromLegacy();
	}

	if (!existsSync(CONFIG_PATH)) {
		return {};
	}
	try {
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		return JSON5.parse(raw) as AppConfig;
	} catch (err) {
		console.error(`Warning: failed to parse ${CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`);
		return {};
	}
}

/** Save config to ~/.clankie/clankie.json (JSON5-formatted with 2-space indent). */
export function saveConfig(config: AppConfig): void {
	getAppDir();
	// JSON5.stringify produces valid JSON5 with trailing commas when possible
	writeFileSync(CONFIG_PATH, `${JSON5.stringify(config, null, 2)}\n`, "utf-8");
	try {
		chmodSync(CONFIG_PATH, 0o600);
	} catch {
		// chmod may not be supported on all platforms; non-fatal
	}
}

/** Deep-merge partial updates into the config. */
export function updateConfig(partial: Partial<AppConfig>): AppConfig {
	const current = loadConfig();
	const updated = deepMerge(
		current as unknown as Record<string, unknown>,
		partial as unknown as Record<string, unknown>,
	);
	saveConfig(updated as unknown as AppConfig);
	return updated as unknown as AppConfig;
}

// ─── Dot-path accessors (for `clankie config get/set`) ───────────────────────

/** Get a value from the config by dot-separated path (e.g. "channels.telegram.botToken") */
export function getByPath(config: AppConfig, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = config;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

/** Set a value in the config by dot-separated path. Returns the updated config. */
export function setByPath(config: AppConfig, path: string, value: unknown): AppConfig {
	const parts = path.split(".");
	const clone = structuredClone(config) as Record<string, unknown>;

	let current: Record<string, unknown> = clone;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (current[part] == null || typeof current[part] !== "object") {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}

	const lastKey = parts[parts.length - 1];
	current[lastKey] = value;

	return clone as unknown as AppConfig;
}

/** Unset (delete) a value from the config by dot-separated path. Returns the updated config. */
export function unsetByPath(config: AppConfig, path: string): AppConfig {
	const parts = path.split(".");
	const clone = structuredClone(config) as Record<string, unknown>;

	let current: Record<string, unknown> = clone;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (current[part] == null || typeof current[part] !== "object") return clone as unknown as AppConfig;
		current = current[part] as Record<string, unknown>;
	}

	delete current[parts[parts.length - 1]];
	return clone as unknown as AppConfig;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const result = { ...target };
	for (const key of Object.keys(source)) {
		const sourceVal = source[key];
		const targetVal = target[key];
		if (
			sourceVal != null &&
			typeof sourceVal === "object" &&
			!Array.isArray(sourceVal) &&
			targetVal != null &&
			typeof targetVal === "object" &&
			!Array.isArray(targetVal)
		) {
			result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
		} else {
			result[key] = sourceVal;
		}
	}
	return result;
}

/** Migrate legacy ~/.clankie/config.json (flat keys) to new ~/.clankie/clankie.json (nested). */
function migrateFromLegacy(): void {
	try {
		const raw = readFileSync(LEGACY_CONFIG_PATH, "utf-8");
		const legacy = JSON.parse(raw) as Record<string, unknown>;

		const config: AppConfig = {};

		// Map flat keys → nested structure
		if (legacy.workspace || legacy.agentDir || legacy.provider || legacy.model) {
			config.agent = {};
			if (legacy.workspace) config.agent.workspace = legacy.workspace as string;
			if (legacy.agentDir) config.agent.agentDir = legacy.agentDir as string;
			if (legacy.model) {
				config.agent.model = { primary: legacy.model as string };
			}
		}

		saveConfig(config);
		console.log(`Migrated config: ${LEGACY_CONFIG_PATH} → ${CONFIG_PATH}`);
	} catch {
		// Migration failed — non-fatal
	}
}

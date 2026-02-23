/**
 * lil configuration management
 *
 * Reads an optional JSON5 config from ~/.lil/lil.json (comments + trailing commas allowed).
 * Structure mirrors OpenClaw's ~/.openclaw/openclaw.json where applicable.
 *
 * Authentication credentials are managed by pi's AuthStorage
 * at ~/.pi/agent/auth.json — shared between `pi` and `lil`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import JSON5 from "json5";

// ─── Config types ────────────────────────────────────────────────────────────

export interface LilConfig {
  /** Agent runtime settings */
  agent?: {
    /** Default persona name (default: "default") */
    persona?: string;
    /** Working directory for the agent (default: ~/.lil/workspace) */
    workspace?: string;
    /** Override for pi's agent dir (default: ~/.lil) */
    agentDir?: string;
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
    telegram?: {
      enabled?: boolean;
      /** Persona name override for this channel */
      persona?: string;
      /** Bot token from @BotFather */
      botToken?: string;
      /** Allowed Telegram user IDs */
      allowFrom?: number[];
    };
    // Future channels:
    // whatsapp?: { ... };
    // signal?: { ... };
  };

  /** Cron / scheduled jobs */
  cron?: {
    enabled?: boolean;
  };

  /** Web UI server */
  web?: {
    /** Enable web server (default: true) */
    enabled?: boolean;
    /** Persona name override for this channel */
    persona?: string;
    /** Bind host (default: 127.0.0.1) */
    host?: string;
    /** Bind port (default: 3333) */
    port?: number;
    /** Bearer/cookie token for API + WebSocket auth */
    token?: string;
  };

  /** Heartbeat — periodic task execution */
  heartbeat?: {
    /** Enable heartbeat (default: true when daemon is running) */
    enabled?: boolean;
    /** Check interval in minutes (default: 30, min: 5) */
    intervalMinutes?: number;
  };
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const LIL_DIR = join(homedir(), ".lil");
const CONFIG_PATH = join(LIL_DIR, "lil.json");
/** Legacy path — migrated automatically */
const LEGACY_CONFIG_PATH = join(LIL_DIR, "config.json");

/** Returns the path to lil's config directory, creating it if needed. */
export function getLilDir(): string {
  if (!existsSync(LIL_DIR)) {
    mkdirSync(LIL_DIR, { recursive: true, mode: 0o700 });
  }
  return LIL_DIR;
}

/** Resolves the workspace directory, creating it if needed. */
export function getWorkspace(config?: LilConfig): string {
  const workspace = config?.agent?.workspace ?? join(homedir(), ".lil", "workspace");
  const resolved = workspace.replace(/^~/, homedir());
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true, mode: 0o755 });
  }
  return resolved;
}

/** Resolves pi's agent directory (defaults to ~/.lil to keep lil self-contained). */
export function getAgentDir(config?: LilConfig): string {
  return config?.agent?.agentDir ?? join(homedir(), ".lil");
}

/** Returns the path to lil's auth file (~/.lil/auth.json). */
export function getAuthPath(): string {
  return join(getLilDir(), "auth.json");
}

/** Path to the config file */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/** Returns a valid web auth token, generating and persisting one if needed. */
export function ensureWebToken(config?: LilConfig): string {
  const current = config ?? loadConfig();
  const token = current.web?.token;
  if (token && token.length >= 16) return token;

  const nextToken = randomUUID();
  const updated = setByPath(current, "web.token", nextToken);
  saveConfig(updated);
  return nextToken;
}

// ─── Loading & saving ─────────────────────────────────────────────────────────

/** Load lil config from ~/.lil/lil.json (JSON5). Returns empty config if missing. */
export function loadConfig(): LilConfig {
  getLilDir();

  // Auto-migrate legacy config.json → lil.json
  if (!existsSync(CONFIG_PATH) && existsSync(LEGACY_CONFIG_PATH)) {
    migrateFromLegacy();
  }

  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON5.parse(raw) as LilConfig;
  } catch (err) {
    console.error(`Warning: failed to parse ${CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    return {};
  }
}

/** Save lil config to ~/.lil/lil.json (JSON5-formatted with 2-space indent). */
export function saveConfig(config: LilConfig): void {
  getLilDir();
  // JSON5.stringify produces valid JSON5 with trailing commas when possible
  writeFileSync(CONFIG_PATH, JSON5.stringify(config, null, 2) + "\n", "utf-8");
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // chmod may not be supported on all platforms; non-fatal
  }
}

/** Deep-merge partial updates into the config. */
export function updateConfig(partial: Partial<LilConfig>): LilConfig {
  const current = loadConfig();
  const updated = deepMerge(
    current as unknown as Record<string, unknown>,
    partial as unknown as Record<string, unknown>
  );
  saveConfig(updated as unknown as LilConfig);
  return updated as unknown as LilConfig;
}

// ─── Dot-path accessors (for `lil config get/set`) ───────────────────────────

/** Get a value from the config by dot-separated path (e.g. "channels.telegram.botToken") */
export function getByPath(config: LilConfig, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Set a value in the config by dot-separated path. Returns the updated config. */
export function setByPath(config: LilConfig, path: string, value: unknown): LilConfig {
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

  return clone as unknown as LilConfig;
}

/** Unset (delete) a value from the config by dot-separated path. Returns the updated config. */
export function unsetByPath(config: LilConfig, path: string): LilConfig {
  const parts = path.split(".");
  const clone = structuredClone(config) as Record<string, unknown>;

  let current: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] == null || typeof current[part] !== "object") return clone as unknown as LilConfig;
    current = current[part] as Record<string, unknown>;
  }

  delete current[parts[parts.length - 1]];
  return clone as unknown as LilConfig;
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
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/** Migrate legacy ~/.lil/config.json (flat keys) to new ~/.lil/lil.json (nested). */
function migrateFromLegacy(): void {
  try {
    const raw = readFileSync(LEGACY_CONFIG_PATH, "utf-8");
    const legacy = JSON.parse(raw) as Record<string, unknown>;

    const config: LilConfig = {};

    // Map flat keys → nested structure
    if (legacy.workspace || legacy.agentDir || legacy.provider || legacy.model) {
      config.agent = {};
      if (legacy.workspace) config.agent.workspace = legacy.workspace as string;
      if (legacy.agentDir) config.agent.agentDir = legacy.agentDir as string;
      if (legacy.model) {
        config.agent.model = { primary: legacy.model as string };
      }
    }

    if (legacy.telegramToken || legacy.allowedUsers) {
      config.channels = {
        telegram: {},
      };
      if (legacy.telegramToken) config.channels.telegram!.botToken = legacy.telegramToken as string;
      if (legacy.allowedUsers) config.channels.telegram!.allowFrom = legacy.allowedUsers as number[];
    }

    saveConfig(config);
    console.log(`Migrated config: ${LEGACY_CONFIG_PATH} → ${CONFIG_PATH}`);
  } catch {
    // Migration failed — non-fatal
  }
}

// ─── Persona helpers ──────────────────────────────────────────────────────────

/** Returns the path to the personas directory (~/.lil/personas/), creating it if needed. */
export function getPersonasDir(): string {
  const dir = join(getLilDir(), "personas");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/** Returns the path to a specific persona directory. */
export function getPersonaDir(personaName: string): string {
  return join(getPersonasDir(), personaName);
}

/**
 * Load persona-specific model configuration from persona.json.
 * Returns the model spec (provider/model) if set, otherwise undefined.
 */
export function resolvePersonaModel(personaName: string): string | undefined {
  const configPath = join(getPersonaDir(personaName), "persona.json");
  if (!existsSync(configPath)) return undefined;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON5.parse(raw) as { model?: string };
    return config.model;
  } catch {
    return undefined;
  }
}

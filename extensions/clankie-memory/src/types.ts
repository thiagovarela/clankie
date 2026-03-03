import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import JSON5 from "json5";

export interface MemoryConfig {
	enabled: boolean;
	dbPath: string;
	embedding: {
		provider: "openai" | "ollama";
		model: string;
		apiKey?: string;
		baseUrl?: string;
		dimensions: number;
	};
	search: {
		vectorWeight: number;
		textWeight: number;
		maxResults: number;
		candidateMultiplier: number;
		mmr: { enabled: boolean; lambda: number };
		temporalDecay: { enabled: boolean; halfLifeDays: number };
	};
	chunkTargetTokens: number;
	chunkOverlapTokens: number;
	debounceMs: number;
}

export interface MemoryChunk {
	id: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
	content: string;
	embedding?: number[];
}

export interface MemorySearchResult {
	id: string;
	snippet: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
	score: number;
	textScore: number;
	vectorScore: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
	enabled: true,
	dbPath: join(os.homedir(), ".clankie", "memory.sqlite"),
	embedding: {
		provider: "openai",
		model: "text-embedding-3-small",
		dimensions: 1536,
	},
	search: {
		vectorWeight: 0.7,
		textWeight: 0.3,
		maxResults: 10,
		candidateMultiplier: 4,
		mmr: {
			enabled: true,
			lambda: 0.7,
		},
		temporalDecay: {
			enabled: true,
			halfLifeDays: 30,
		},
	},
	chunkTargetTokens: 400,
	chunkOverlapTokens: 80,
	debounceMs: 1500,
};

function deepMerge(base: unknown, patch: unknown): Record<string, unknown> {
	const baseObj = base && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
	if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
		return { ...baseObj };
	}
	const out: Record<string, unknown> = { ...baseObj };
	for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
		const current = out[key];
		if (
			current &&
			typeof current === "object" &&
			!Array.isArray(current) &&
			value &&
			typeof value === "object" &&
			!Array.isArray(value)
		) {
			out[key] = deepMerge(current, value);
		} else {
			out[key] = value;
		}
	}
	return out;
}

function readJsonFile(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path, "utf8");
		const parsed = JSON5.parse(raw);
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Ignore malformed settings and fallback to defaults.
	}
	return null;
}

export function resolveMemoryConfig(cwd: string): MemoryConfig {
	const projectSettingsPath = join(cwd, ".pi", "settings.json");
	const localAppSettingsPath = join(cwd, ".clankie", "settings.json");
	const userAppSettingsPath = join(os.homedir(), ".clankie", "settings.json");

	const projectSettings = readJsonFile(projectSettingsPath);
	const localAppSettings = readJsonFile(localAppSettingsPath);
	const userAppSettings = readJsonFile(userAppSettingsPath);

	const projectNamespace = projectSettings?.["clankie-memory"];
	const localNamespace = localAppSettings?.["clankie-memory"];
	const userNamespace = userAppSettings?.["clankie-memory"];

	const merged = deepMerge(
		deepMerge(deepMerge(DEFAULT_MEMORY_CONFIG as unknown, userNamespace), localNamespace),
		projectNamespace,
	) as Partial<MemoryConfig>;

	const dbPath = typeof merged.dbPath === "string" ? merged.dbPath : DEFAULT_MEMORY_CONFIG.dbPath;
	const resolvedDbPath = dbPath.startsWith("~") ? join(os.homedir(), dbPath.slice(1)) : resolve(cwd, dbPath);

	return {
		...DEFAULT_MEMORY_CONFIG,
		...merged,
		dbPath: resolvedDbPath,
		embedding: {
			...DEFAULT_MEMORY_CONFIG.embedding,
			...(merged.embedding ?? {}),
		},
		search: {
			...DEFAULT_MEMORY_CONFIG.search,
			...(merged.search ?? {}),
			mmr: {
				...DEFAULT_MEMORY_CONFIG.search.mmr,
				...(merged.search?.mmr ?? {}),
			},
			temporalDecay: {
				...DEFAULT_MEMORY_CONFIG.search.temporalDecay,
				...(merged.search?.temporalDecay ?? {}),
			},
		},
	};
}

export function getMemoryDir(cwd: string): string {
	return join(cwd, "memory");
}

export function resolveMemoryFilePath(cwd: string, type: "daily" | "longterm", date = new Date()): string {
	if (type === "longterm") {
		return join(cwd, "MEMORY.md");
	}
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return join(getMemoryDir(cwd), `${y}-${m}-${d}.md`);
}

export function formatRelativePath(baseDir: string, absolutePath: string): string {
	if (absolutePath.startsWith(baseDir)) {
		return absolutePath.slice(baseDir.length + Number(absolutePath.startsWith(`${baseDir}/`)));
	}
	return absolutePath;
}

export function ensureParentDir(path: string): string {
	return dirname(path);
}

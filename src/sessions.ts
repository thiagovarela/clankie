/**
 * Shared session management for channels.
 *
 * Channels use this to create and cache agent sessions per chat.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";
import {
	type AgentSession,
	AuthStorage,
	type CreateAgentSessionResult,
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionFactory,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { Attachment } from "./channels/channel.ts";
import { type AppConfig, getAgentDir, getAppDir, getAuthPath, getWorkspace } from "./config.ts";
import { createCronExtension } from "./extensions/cron/index.ts";
import { createHeartbeatExtension } from "./extensions/heartbeat/index.ts";
import { createWorkspaceJailExtension } from "./extensions/workspace-jail.ts";
import { resolveScopedModels } from "./lib/scoped-model-resolver.ts";

// ─── Session cache (one session per chat) ──────────────────────────────────────

const sessionCache = new Map<string, AgentSession>();

// Track active session name per chat (for /switch command)
const activeSessionNames = new Map<string, string>();

/** Lock to serialize message processing per chat */
const chatLocks = new Map<string, Promise<void>>();

function buildExtensionFactories(config: AppConfig, cwd: string): ExtensionFactory[] {
	const extensionFactories: ExtensionFactory[] = [];
	extensionFactories.push(createCronExtension());
	extensionFactories.push(createHeartbeatExtension());

	const restrictToWorkspace = config.agent?.restrictToWorkspace ?? true; // default: enabled
	if (restrictToWorkspace) {
		const configuredAllowedPaths = config.agent?.allowedPaths ?? [];
		const attachmentRoot = join(getAppDir(), "attachments");
		const allowedPaths = Array.from(new Set([...configuredAllowedPaths, attachmentRoot]));
		extensionFactories.push(createWorkspaceJailExtension(cwd, allowedPaths));
	}

	return extensionFactories;
}

type ResourcePathMetadata = {
	source?: string;
	scope?: "user" | "project" | "temporary";
	baseDir?: string;
};

function toDisplayPath(filePath: string, baseDir?: string): string {
	const resolvedFilePath = resolve(filePath);
	if (baseDir) {
		const rel = relative(baseDir, resolvedFilePath);
		if (rel && rel !== "." && !rel.startsWith("..")) {
			return rel;
		}
	}

	const home = homedir();
	if (resolvedFilePath === home) return "~";
	if (resolvedFilePath.startsWith(`${home}/`)) {
		return `~/${resolvedFilePath.slice(home.length + 1)}`;
	}
	return resolvedFilePath;
}

function inferSourceFromPath(filePath: string, cwd: string, agentDir: string): string {
	const resolvedFilePath = resolve(filePath);
	const resolvedCwd = resolve(cwd);
	const resolvedAgentDir = resolve(agentDir);
	const resolvedAgentsDir = resolve(join(homedir(), ".agents"));

	if (resolvedFilePath.startsWith(`${resolvedCwd}/`)) return "project";
	if (resolvedFilePath.startsWith(`${resolvedAgentDir}/`) || resolvedFilePath.startsWith(`${resolvedAgentsDir}/`)) {
		return "user";
	}
	return "auto";
}

function normalizeSourceLabel(source: string): string {
	if (source.startsWith("npm:") || source.startsWith("git:")) return source;
	if (source === "cli" || source === "project" || source === "user") return source;
	if (source.includes("/") || source.startsWith(".")) {
		const name = basename(source);
		return name || source;
	}
	return source;
}

function getSourceLabel(
	metadata: ResourcePathMetadata | undefined,
	filePath: string,
	cwd: string,
	agentDir: string,
): string {
	if (metadata?.source === "local") {
		if (metadata.scope === "project") return "project";
		return "user";
	}
	if (metadata?.source && metadata.source !== "auto") return normalizeSourceLabel(metadata.source);
	return inferSourceFromPath(filePath, cwd, agentDir);
}

function formatSection(title: string, items: Array<{ source: string; path: string }>): string[] {
	const lines = [`[${title}]`];
	if (items.length === 0) {
		lines.push("  (none)");
		return lines;
	}

	const grouped = new Map<string, Set<string>>();
	for (const item of items) {
		const sourceItems = grouped.get(item.source) ?? new Set<string>();
		sourceItems.add(item.path);
		grouped.set(item.source, sourceItems);
	}

	for (const source of Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))) {
		lines.push(`  ${source}`);
		for (const path of Array.from(grouped.get(source) ?? []).sort((a, b) => a.localeCompare(b))) {
			lines.push(`    ${path}`);
		}
	}

	return lines;
}

export async function logStartupLoadedResources(config: AppConfig): Promise<void> {
	const agentDir = getAgentDir(config);
	const cwd = getWorkspace(config);

	// DefaultResourceLoader with clankie-specific paths
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		extensionFactories: buildExtensionFactories(config, cwd),
	});
	await loader.reload();

	const pathMetadata = loader.getPathMetadata();

	const extensionItems = loader.getExtensions().extensions.map((extension) => {
		const metadata =
			(pathMetadata.get(extension.path) as ResourcePathMetadata | undefined) ??
			(pathMetadata.get(extension.resolvedPath) as ResourcePathMetadata | undefined);
		return {
			source: getSourceLabel(metadata, extension.resolvedPath, cwd, agentDir),
			path: toDisplayPath(extension.resolvedPath, metadata?.baseDir),
		};
	});

	const skillItems = loader.getSkills().skills.map((skill) => {
		const metadata = pathMetadata.get(skill.filePath) as ResourcePathMetadata | undefined;
		return {
			source: getSourceLabel(metadata, skill.filePath, cwd, agentDir),
			path: toDisplayPath(skill.filePath, metadata?.baseDir),
		};
	});

	console.log("[daemon] Loaded startup resources:");
	for (const line of [...formatSection("Skills", skillItems), "", ...formatSection("Extensions", extensionItems)]) {
		console.log(line);
	}
}

// ─── Session factory ───────────────────────────────────────────────────────────

export async function getOrCreateSession(chatKey: string, config: AppConfig): Promise<AgentSession> {
	console.log(`[session] getOrCreateSession called - chatKey: ${chatKey}, cache has: ${sessionCache.size} entries`);
	const cached = sessionCache.get(chatKey);
	if (cached) {
		console.log(`[session] Returning cached session - chatKey: ${chatKey}, session.sessionId: ${cached.sessionId}`);
		return cached;
	}
	console.log(`[session] No cached session found for chatKey: ${chatKey}, creating new...`);

	const agentDir = getAgentDir(config);
	const cwd = getWorkspace(config);

	const authStorage = AuthStorage.create(getAuthPath());
	const modelRegistry = new ModelRegistry(authStorage);

	// DefaultResourceLoader with clankie-specific paths
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		extensionFactories: buildExtensionFactories(config, cwd),
	});
	await loader.reload();

	// Use a stable session directory per chat so conversations persist across restarts
	const sessionDir = join(getAppDir(), "sessions", chatKey);

	// Ensure session directory exists
	if (!existsSync(sessionDir)) {
		mkdirSync(sessionDir, { recursive: true });
	}

	// SessionManager.continueRecent continues the most recent session in the given directory
	// It SHOULD keep using that directory for all future saves
	const sessionManager = SessionManager.continueRecent(cwd, sessionDir);
	console.log(`[session] SessionManager created for chatKey: ${chatKey}, sessionDir: ${sessionDir}`);

	// Resolve model from config → pi auto-detection
	const modelSpec = config.agent?.model?.primary;
	let model: ReturnType<typeof modelRegistry.find> | undefined;
	if (modelSpec) {
		const slash = modelSpec.indexOf("/");
		if (slash !== -1) {
			const provider = modelSpec.substring(0, slash);
			const modelId = modelSpec.substring(slash + 1);
			model = modelRegistry.find(provider, modelId);
			if (!model) {
				console.warn(`[session] Warning: model "${modelSpec}" from config not found, falling back to auto-detection`);
			}
		}
	}

	const result: CreateAgentSessionResult = await createAgentSession({
		cwd,
		agentDir,
		authStorage,
		modelRegistry,
		resourceLoader: loader,
		sessionManager,
		model,
		settingsManager,
	});

	const { session } = result;
	console.log(
		`[session] Created AgentSession - chatKey: ${chatKey}, session.sessionId: ${session.sessionId}, session.sessionFile: ${session.sessionFile}`,
	);

	// Apply scoped models if configured
	const enabledModels = session.settingsManager.getEnabledModels();
	if (enabledModels && enabledModels.length > 0) {
		const available = await session.modelRegistry.getAvailable();
		const resolved = resolveScopedModels(enabledModels, available).map((model) => ({
			model,
			thinkingLevel: session.thinkingLevel,
		}));
		if (resolved.length > 0) {
			session.setScopedModels(resolved);
			console.log(`[session] Applied ${resolved.length} scoped models for session ${chatKey}`);
		}
	}

	// Bind extensions (headless — no UI)
	await session.bindExtensions({
		commandContextActions: {
			waitForIdle: () => session.agent.waitForIdle(),
			newSession: async (opts) => {
				const success = await session.newSession({ parentSession: opts?.parentSession });
				if (success && opts?.setup) {
					await opts.setup(session.sessionManager);
				}
				return { cancelled: !success };
			},
			fork: async (entryId) => {
				const r = await session.fork(entryId);
				return { cancelled: r.cancelled };
			},
			navigateTree: async (targetId, opts) => {
				const r = await session.navigateTree(targetId, {
					summarize: opts?.summarize,
					customInstructions: opts?.customInstructions,
					replaceInstructions: opts?.replaceInstructions,
					label: opts?.label,
				});
				return { cancelled: r.cancelled };
			},
			switchSession: async (sessionPath) => {
				const success = await session.switchSession(sessionPath);
				return { cancelled: !success };
			},
			reload: async () => {
				await session.reload();
			},
		},
		onError: (err) => {
			console.error(`[session] Extension error (${err.extensionPath}): ${err.error}`);
		},
	});

	// Subscribe to enable session persistence
	session.subscribe(() => {});

	console.log(`[session] Caching session - chatKey: ${chatKey}, session.sessionId: ${session.sessionId}`);
	sessionCache.set(chatKey, session);

	// Log the cache state
	console.log(`[session] Session cache now has ${sessionCache.size} entries`);

	return session;
}

// ─── Session helpers ───────────────────────────────────────────────────────────

/**
 * List all session names for a given chat identifier.
 * Scans ~/.clankie/sessions/ for directories matching the chatIdentifier prefix.
 */
export function listSessionNames(chatIdentifier: string): string[] {
	const sessionsDir = join(getAppDir(), "sessions");
	if (!existsSync(sessionsDir)) {
		return [];
	}

	try {
		const { readdirSync, statSync } = require("node:fs");
		const entries = readdirSync(sessionsDir);
		const sessionNames = new Set<string>();

		for (const entry of entries) {
			// Session directories are named: {channel}_{chatId}_{sessionName}
			// We want to extract unique sessionNames for this chatIdentifier
			if (entry.startsWith(`${chatIdentifier}_`)) {
				const entryPath = join(sessionsDir, entry);
				if (statSync(entryPath).isDirectory()) {
					// Extract session name from: chatIdentifier_sessionName
					const sessionName = entry.substring(chatIdentifier.length + 1);
					if (sessionName) {
						sessionNames.add(sessionName);
					}
				}
			}
		}

		return Array.from(sessionNames).sort();
	} catch (err) {
		console.error(`[session] Error listing session names: ${err instanceof Error ? err.message : String(err)}`);
		return [];
	}
}

/**
 * Get or set active session name for a chat.
 */
export function getActiveSessionName(chatIdentifier: string): string {
	return activeSessionNames.get(chatIdentifier) ?? "default";
}

export function setActiveSessionName(chatIdentifier: string, sessionName: string): void {
	activeSessionNames.set(chatIdentifier, sessionName);
}

// ─── Attachment helpers ────────────────────────────────────────────────────────

const IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Convert image attachments to pi's ImageContent format for vision models. */
export function toImageContents(attachments?: Attachment[]): ImageContent[] {
	if (!attachments) return [];
	return attachments
		.filter((a) => IMAGE_MIME_PREFIXES.some((prefix) => a.mimeType.startsWith(prefix)))
		.map((a) => ({ type: "image" as const, data: a.data, mimeType: a.mimeType }));
}

/** Save non-image attachments to disk and return their paths. */
export async function saveNonImageAttachments(
	attachments: Attachment[] | undefined,
	chatKey: string,
): Promise<{ fileName: string; path: string }[]> {
	if (!attachments) return [];

	const nonImages = attachments.filter((a) => !IMAGE_MIME_PREFIXES.some((prefix) => a.mimeType.startsWith(prefix)));
	if (nonImages.length === 0) return [];

	const { mkdirSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");

	const dir = join(getAppDir(), "attachments", chatKey);
	mkdirSync(dir, { recursive: true });

	const results: { fileName: string; path: string }[] = [];
	for (const att of nonImages) {
		const name = att.fileName || `file_${Date.now()}`;
		const filePath = join(dir, name);
		writeFileSync(filePath, Buffer.from(att.data, "base64"));
		results.push({ fileName: name, path: filePath });
		console.log(`[session] Saved attachment: ${filePath} (${att.mimeType})`);
	}
	return results;
}

// ─── Chat lock helpers ─────────────────────────────────────────────────────────

/**
 * Acquire a lock for a chat to serialize message processing.
 * Returns a promise that completes when the action finishes.
 */
export async function withChatLock<T>(chatKey: string, action: () => Promise<T>): Promise<T> {
	const previous = chatLocks.get(chatKey) ?? Promise.resolve();
	const current = previous.then(action, action); // Run action even if previous failed
	chatLocks.set(
		chatKey,
		current.then(
			() => {},
			() => {},
		),
	); // Swallow errors in the chain
	return current;
}

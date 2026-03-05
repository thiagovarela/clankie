/**
 * clankie agent session wrapper
 *
 * Creates an AgentSession using pi's SDK with DefaultResourceLoader
 * discovery — skills, extensions, prompt templates, context files all
 * load from clankie's own directories (~/.clankie/, .pi/, etc.).
 *
 * By setting agentDir to ~/.clankie/, we keep clankie isolated from
 * pi's default directories (~/.pi/agent/) while leveraging pi's
 * battle-tested resource loading (jiti, PackageManager, SettingsManager).
 *
 * Model is resolved from ~/.clankie/clankie.json → agent.model.primary (provider/model format).
 * If not set, falls back to pi's default resolution (settings → first available).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	AuthStorage,
	type CreateAgentSessionResult,
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionFactory,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { type AppConfig, getAgentDir, getAppDir, getAuthPath, getWorkspace, loadConfig } from "./config.ts";
import { createCronExtension } from "./extensions/cron/index.ts";
import { createHeartbeatExtension } from "./extensions/heartbeat/index.ts";
import { createPackageManagerExtension } from "./extensions/package-manager.ts";
import { createReloadRuntimeExtension } from "./extensions/reload-runtime.ts";
import { createWorkspaceJailExtension } from "./extensions/workspace-jail.ts";
import { reloadAllSessions } from "./sessions.ts";

// ─── Shared loader infrastructure ──────────────────────────────────────────────

/**
 * Build the standard set of extension factories for clankie sessions.
 * Includes cron, heartbeat, and (optionally) workspace jail.
 */
export function buildExtensionFactories(config: AppConfig, cwd: string): ExtensionFactory[] {
	const extensionFactories: ExtensionFactory[] = [];
	extensionFactories.push(createCronExtension());
	extensionFactories.push(createHeartbeatExtension());
	extensionFactories.push(createPackageManagerExtension(reloadAllSessions));
	extensionFactories.push(createReloadRuntimeExtension(reloadAllSessions));

	const restrictToWorkspace = config.agent?.restrictToWorkspace ?? true; // default: enabled
	if (restrictToWorkspace) {
		const configuredAllowedPaths = config.agent?.allowedPaths ?? [];
		const attachmentRoot = join(getAppDir(), "attachments");
		const allowedPaths = Array.from(new Set([...configuredAllowedPaths, attachmentRoot]));
		extensionFactories.push(createWorkspaceJailExtension(cwd, allowedPaths));
	}

	return extensionFactories;
}

/**
 * Create a fully configured DefaultResourceLoader with clankie's paths.
 *
 * This is the single source of truth for resource loading configuration.
 * Both CLI sessions and daemon sessions must use this to ensure consistent
 * discovery of extensions, skills, prompts, and themes.
 */
export async function createResourceLoader(
	config: AppConfig,
	options?: { cwd?: string },
): Promise<{ loader: DefaultResourceLoader; settingsManager: SettingsManager }> {
	const agentDir = getAgentDir(config);
	const cwd = options?.cwd ?? getWorkspace(config);

	const settingsManager = SettingsManager.create(cwd, agentDir);
	const extensionFactories = buildExtensionFactories(config, cwd);

	// Bundled skills shipped with clankie (e.g. clankie-admin)
	const bundledSkillsDir = join(import.meta.dirname, "..", "skills");
	const additionalSkillPaths = existsSync(bundledSkillsDir) ? [bundledSkillsDir] : [];

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		extensionFactories,
		additionalSkillPaths,
	});
	await loader.reload();

	return { loader, settingsManager };
}

/**
 * Resolve model from clankie config (provider/model format).
 * Returns undefined if not configured or not found in registry.
 */
export function resolveModelFromConfig(
	config: AppConfig,
	modelRegistry: ModelRegistry,
): ReturnType<typeof ModelRegistry.prototype.find> | undefined {
	const modelSpec = config.agent?.model?.primary;
	if (!modelSpec) return undefined;

	const slash = modelSpec.indexOf("/");
	if (slash === -1) {
		console.warn(`Warning: model should be "provider/model" format (got "${modelSpec}")`);
		return undefined;
	}

	const provider = modelSpec.substring(0, slash);
	const modelId = modelSpec.substring(slash + 1);
	const model = modelRegistry.find(provider, modelId);
	if (!model) {
		console.warn(`Warning: model "${modelSpec}" from config not found in registry, falling back to auto-detection`);
	}
	return model;
}

// ─── CLI session creation ──────────────────────────────────────────────────────

export interface SessionOptions {
	/**
	 * Working directory for the agent.
	 * Defaults to config.workspace, then process.cwd().
	 */
	cwd?: string;

	/**
	 * If true, session is NOT persisted to disk (ephemeral in-memory session).
	 * Default: false — creates a new persistent session under ~/.clankie/sessions/.
	 */
	ephemeral?: boolean;

	/**
	 * If true, continue the most recent session instead of starting a new one.
	 */
	continueRecent?: boolean;

	/**
	 * Path to a specific session file to open.
	 */
	sessionFile?: string;
}

/**
 * Create a pi agent session with the app's configuration.
 *
 * Uses the shared createResourceLoader to ensure consistent resource discovery.
 */
export async function createSession(options: SessionOptions = {}): Promise<CreateAgentSessionResult> {
	const config = loadConfig();
	const agentDir = getAgentDir(config);
	const cwd = options.cwd ?? getWorkspace(config);

	// Auth stored in ~/.clankie/auth.json (separate from pi's ~/.pi/agent/auth.json)
	const authStorage = AuthStorage.create(getAuthPath());
	const modelRegistry = new ModelRegistry(authStorage);

	const { loader, settingsManager } = await createResourceLoader(config, { cwd });

	// Session management
	let sessionManager: SessionManager;
	if (options.ephemeral) {
		sessionManager = SessionManager.inMemory();
	} else if (options.sessionFile) {
		sessionManager = SessionManager.open(options.sessionFile);
	} else if (options.continueRecent) {
		sessionManager = SessionManager.continueRecent(cwd);
	} else {
		sessionManager = SessionManager.create(cwd);
	}

	const model = resolveModelFromConfig(config, modelRegistry);

	return createAgentSession({
		cwd,
		agentDir,
		authStorage,
		modelRegistry,
		resourceLoader: loader,
		sessionManager,
		model,
		settingsManager,
	});
}

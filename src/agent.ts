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
import { getAgentDir, getAppDir, getAuthPath, getWorkspace, loadConfig } from "./config.ts";
import { createCronExtension } from "./extensions/cron/index.ts";
import { createHeartbeatExtension } from "./extensions/heartbeat/index.ts";
import { createWorkspaceJailExtension } from "./extensions/workspace-jail.ts";

export interface SessionOptions {
	/**
	 * Working directory for the agent.
	 * Defaults to config.workspace, then process.cwd().
	 */
	cwd?: string;

	/**
	 * If true, session is NOT persisted to disk (ephemeral in-memory session).
	 * Default: false — creates a new persistent session under ~/.pi/agent/sessions/.
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
 * Uses pi's DefaultResourceLoader configured to use clankie's directories,
 * keeping the app isolated from pi's default agent directory (~/.pi/agent/)
 * while properly supporting extension loading, package management, and settings.
 */
export async function createSession(options: SessionOptions = {}): Promise<CreateAgentSessionResult> {
	const config = loadConfig();
	const agentDir = getAgentDir(config);
	const cwd = options.cwd ?? getWorkspace(config);

	// Auth stored in ~/.clankie/auth.json (separate from pi's ~/.pi/agent/auth.json)
	const authStorage = AuthStorage.create(getAuthPath());
	const modelRegistry = new ModelRegistry(authStorage);

	// Build extension factories (workspace jail if enabled)
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

	// DefaultResourceLoader with clankie-specific paths
	// agentDir=~/.clankie isolates from ~/.pi/agent/ while supporting full
	// extension loading (jiti), package management, and settings integration.
	const settingsManager = SettingsManager.create(cwd, agentDir);
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
				console.warn(`Warning: model "${modelSpec}" from config not found in registry, falling back to auto-detection`);
			}
		} else {
			console.warn(`Warning: model should be "provider/model" format (got "${modelSpec}")`);
		}
	}

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

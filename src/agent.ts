/**
 * clankie agent session wrapper
 *
 * Creates an AgentSession using pi's SDK with full DefaultResourceLoader
 * discovery — skills, extensions, prompt templates, context files all
 * load from the standard pi directories (~/.pi/agent/, .pi/, etc.).
 *
 * Model is resolved from ~/.clankie/clankie.json → agent.model.primary (provider/model format).
 * If not set, falls back to pi's default resolution (settings → first available).
 */

import {
	AuthStorage,
	type CreateAgentSessionResult,
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import { getAgentDir, getAuthPath, getWorkspace, loadConfig } from "./config.ts";

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
 * Uses pi's DefaultResourceLoader so the entire pi extension ecosystem
 * (~/.pi/agent/extensions/, ~/.agents/skills/, AGENTS.md, etc.) is
 * automatically available.
 */
export async function createSession(options: SessionOptions = {}): Promise<CreateAgentSessionResult> {
	const config = loadConfig();
	const agentDir = getAgentDir(config);
	const cwd = options.cwd ?? getWorkspace(config);

	// Auth stored in ~/.clankie/auth.json (separate from pi's ~/.pi/agent/auth.json)
	const authStorage = AuthStorage.create(getAuthPath());
	const modelRegistry = new ModelRegistry(authStorage);

	// DefaultResourceLoader with standard pi discovery
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
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
	});
}

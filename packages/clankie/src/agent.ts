/**
 * clankie agent session wrapper
 *
 * Creates an AgentSession using pi's SDK with full DefaultResourceLoader
 * discovery — skills, extensions, prompt templates, context files all
 * load from the standard pi directories (~/.pi/agent/, .pi/, etc.).
 *
 * The app's own security and persona extensions are loaded in addition to
 * any user extensions.
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
import { getAgentDir, getAuthPath, getPersonaDir, getWorkspace, loadConfig, resolvePersonaModel } from "./config.ts";
import cronExtension from "./extensions/cron/index.ts";
import { createPersonaExtension } from "./extensions/persona/index.ts";
import securityExtension from "./extensions/security.ts";

export interface SessionOptions {
	/**
	 * Persona name to use for this session.
	 * Defaults to config.agent.persona, then "default".
	 */
	persona?: string;

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
 * automatically available. The app's security extension is always loaded.
 */
export async function createSession(options: SessionOptions = {}): Promise<CreateAgentSessionResult> {
	const config = loadConfig();
	const agentDir = getAgentDir(config);
	const cwd = options.cwd ?? getWorkspace(config);

	// Resolve persona name: options → config → "default"
	const personaName = options.persona ?? config.agent?.persona ?? "default";

	// Validate persona name early
	try {
		// This will throw if the persona name is invalid
		getPersonaDir(personaName);
	} catch (err) {
		throw new Error(`Invalid persona name "${personaName}": ${err instanceof Error ? err.message : String(err)}`);
	}

	// Auth stored in ~/.clankie/auth.json (separate from pi's ~/.pi/agent/auth.json)
	const authStorage = AuthStorage.create(getAuthPath());
	const modelRegistry = new ModelRegistry(authStorage);

	// DefaultResourceLoader with standard pi discovery + lil's security extension.
	// Using extensionFactories (not additionalExtensionPaths) so the security
	// extension is bundled and works correctly in both dev and compiled binary modes.
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		extensionFactories: [securityExtension, createPersonaExtension(personaName), cronExtension],
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

	// Resolve model: persona config → global config → pi auto-detection
	const personaModel = resolvePersonaModel(personaName);
	const modelSpec = personaModel ?? config.agent?.model?.primary;
	let model: ReturnType<typeof modelRegistry.find> | undefined;
	if (modelSpec) {
		const slash = modelSpec.indexOf("/");
		if (slash !== -1) {
			const provider = modelSpec.substring(0, slash);
			const modelId = modelSpec.substring(slash + 1);
			model = modelRegistry.find(provider, modelId);
			if (!model) {
				const source = personaModel ? `persona "${personaName}"` : "config";
				console.warn(
					`Warning: model "${modelSpec}" from ${source} not found in registry, falling back to auto-detection`,
				);
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

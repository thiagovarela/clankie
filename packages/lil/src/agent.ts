/**
 * lil agent session wrapper
 *
 * Creates an AgentSession using pi's SDK with full DefaultResourceLoader
 * discovery — skills, extensions, prompt templates, context files all
 * load from the standard pi directories (~/.pi/agent/, .pi/, etc.).
 *
 * lil's own security and persona extensions are loaded in addition to
 * any user extensions.
 *
 * Model is resolved from ~/.lil/lil.json → agent.model.primary (provider/model format).
 * If not set, falls back to pi's default resolution (settings → first available).
 */

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type CreateAgentSessionResult,
} from "@mariozechner/pi-coding-agent";
import { loadConfig, getAgentDir, getWorkspace, getAuthPath } from "./config.ts";
import securityExtension from "./extensions/security.ts";
import personaExtension from "./extensions/persona/index.ts";
import cronExtension from "./extensions/cron/index.ts";

export interface LilSessionOptions {
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
 * Create a pi agent session with lil's configuration.
 *
 * Uses pi's DefaultResourceLoader so the entire pi extension ecosystem
 * (~/.pi/agent/extensions/, ~/.agents/skills/, AGENTS.md, etc.) is
 * automatically available. lil's security extension is always loaded.
 */
export async function createLilSession(
  options: LilSessionOptions = {}
): Promise<CreateAgentSessionResult> {
  const config = loadConfig();
  const agentDir = getAgentDir(config);
  const cwd = options.cwd ?? getWorkspace(config);

  // Auth stored in ~/.lil/auth.json (separate from pi's ~/.pi/agent/auth.json)
  const authStorage = AuthStorage.create(getAuthPath());
  const modelRegistry = new ModelRegistry(authStorage);

  // DefaultResourceLoader with standard pi discovery + lil's security extension.
  // Using extensionFactories (not additionalExtensionPaths) so the security
  // extension is bundled and works correctly in both dev and compiled binary modes.
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    extensionFactories: [securityExtension, personaExtension, cronExtension],
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

  // Resolve model from lil config (agent.model.primary = "provider/model")
  const modelSpec = config.agent?.model?.primary;
  let model;
  if (modelSpec) {
    const slash = modelSpec.indexOf("/");
    if (slash !== -1) {
      const provider = modelSpec.substring(0, slash);
      const modelId = modelSpec.substring(slash + 1);
      model = modelRegistry.find(provider, modelId);
      if (!model) {
        console.warn(`Warning: model "${modelSpec}" not found in registry, falling back to auto-detection`);
      }
    } else {
      console.warn(`Warning: agent.model.primary should be "provider/model" format (got "${modelSpec}")`);
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

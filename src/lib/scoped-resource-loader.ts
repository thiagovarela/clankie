/**
 * Scoped Resource Loader for clankie
 *
 * Unlike DefaultResourceLoader which discovers from global pi directories
 * (~/.pi/agent/, ~/.agents/), this loader is strictly scoped to:
 * - The configured agentDir (e.g., ~/.clankie/)
 * - The workspace directory
 * - Project-local .pi/ directories
 *
 * This ensures clankie is self-contained and doesn't pick up extensions/skills
 * from the global pi installation.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
	ExtensionFactory,
	ExtensionRuntime,
	Extension,
	LoadExtensionsResult,
	ResourceDiagnostic,
	ResourceLoader,
	Skill,
	PromptTemplate,
	PathMetadata,
	Theme,
	ExtensionAPI,
	ToolDefinition,
	RegisteredTool,
	RegisteredCommand,
	ExtensionHandler,
	ExtensionShortcut,
	ExtensionFlag,
	MessageRenderer,
} from "@mariozechner/pi-coding-agent";
import { SettingsManager } from "@mariozechner/pi-coding-agent";
import JSON5 from "json5";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScopedResourceLoaderOptions {
	/** Working directory for project-local discovery */
	cwd: string;
	/** Global agent directory (e.g., ~/.clankie/) */
	agentDir: string;
	/** Optional settings manager */
	settingsManager?: SettingsManager;
	/** Additional extension factories (built-in extensions) */
	extensionFactories?: ExtensionFactory[];
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function expandHome(path: string): string {
	if (path.startsWith("~/")) {
		return join(homedir(), path.slice(2));
	}
	return path;
}

function exists(path: string): boolean {
	try {
		return existsSync(path);
	} catch {
		return false;
	}
}

function readDirSafe(path: string): string[] {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

function readFileSafe(path: string): string | undefined {
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return undefined;
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Find all SKILL.md files in a directory recursively
 */
function findSkillFiles(dir: string): Array<{ filePath: string; baseDir: string }> {
	const results: Array<{ filePath: string; baseDir: string }> = [];
	if (!exists(dir) || !isDirectory(dir)) return results;

	const entries = readDirSafe(dir);
	for (const entry of entries) {
		const fullPath = join(dir, entry);
		if (isDirectory(fullPath)) {
			// Check for SKILL.md in this directory
			const skillPath = join(fullPath, "SKILL.md");
			if (exists(skillPath)) {
				results.push({ filePath: skillPath, baseDir: dir });
			}
			// Recurse into subdirectory
			results.push(...findSkillFiles(fullPath));
		}
	}
	return results;
}

/**
 * Parse a SKILL.md file
 */
function parseSkillFile(filePath: string, baseDir: string): Skill | undefined {
	const content = readFileSafe(filePath);
	if (!content) return undefined;

	// Extract name from directory or file
	const dirName = basename(dirname(filePath));
	const name = dirName;

	// Extract description from first paragraph
	const lines = content.split("\n");
	let description = "";
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#")) {
			description = trimmed.slice(0, 200);
			break;
		}
	}

	return {
		name,
		description: description || `${name} skill`,
		filePath,
		baseDir,
		source: "local",
		disableModelInvocation: false,
	};
}

/**
 * Find prompt template files (.md files in prompts/ directories)
 */
function findPromptFiles(dir: string): Array<{ filePath: string; name: string }> {
	const results: Array<{ filePath: string; name: string }> = [];
	const promptsDir = join(dir, "prompts");
	if (!exists(promptsDir) || !isDirectory(promptsDir)) return results;

	const entries = readDirSafe(promptsDir);
	for (const entry of entries) {
		if (entry.endsWith(".md")) {
			const name = entry.slice(0, -3); // Remove .md
			results.push({
				filePath: join(promptsDir, entry),
				name,
			});
		}
	}
	return results;
}

/**
 * Parse a prompt template file
 */
function parsePromptFile(filePath: string, name: string): PromptTemplate | undefined {
	const content = readFileSafe(filePath);
	if (!content) return undefined;

	// Extract description from first comment or first line
	const lines = content.split("\n");
	let description = "";
	for (const line of lines) {
		const trimmed = line.trim();
		// Look for HTML comment or first non-heading text
		if (trimmed.startsWith("<!--") && trimmed.includes("-->")) {
			description = trimmed.replace(/<!--\s*|\s*-->/g, "").trim();
			break;
		}
		if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("<!--")) {
			description = trimmed.slice(0, 200);
			break;
		}
	}

	return {
		name,
		description: description || `${name} prompt`,
		content,
		filePath,
		source: "local",
	};
}

/**
 * Find AGENTS.md or CLAUDE.md files walking up from cwd
 */
function findContextFiles(cwd: string): Array<{ path: string; content: string }> {
	const results: Array<{ path: string; content: string }> = [];
	const names = ["AGENTS.md", "CLAUDE.md"];

	let current = resolve(cwd);
	const visited = new Set<string>();

	while (current && !visited.has(current)) {
		visited.add(current);
		for (const name of names) {
			const filePath = join(current, name);
			const content = readFileSafe(filePath);
			if (content) {
				results.push({ path: filePath, content });
			}
		}
		// Stop at git repo root or filesystem root
		const parent = dirname(current);
		if (parent === current) break;
		if (exists(join(current, ".git"))) break;
		current = parent;
	}

	return results;
}

/**
 * Find global context file in agentDir
 */
function findGlobalContextFile(agentDir: string): Array<{ path: string; content: string }> {
	const results: Array<{ path: string; content: string }> = [];
	const names = ["AGENTS.md", "CLAUDE.md"];

	for (const name of names) {
		const filePath = join(agentDir, name);
		const content = readFileSafe(filePath);
		if (content) {
			results.push({ path: filePath, content });
		}
	}

	return results;
}

/**
 * Create a stub ExtensionRuntime for initial state
 */
function createStubExtensionRuntime(): ExtensionRuntime {
	const noop = () => {};
	const throwError = () => {
		throw new Error("Extension runtime not initialized");
	};
	const asyncThrowError = async () => {
		throw new Error("Extension runtime not initialized");
	};

	return {
		// ExtensionRuntimeState
		flagValues: new Map(),
		pendingProviderRegistrations: [],
		registerProvider: noop,
		unregisterProvider: noop,

		// ExtensionActions - throwing stubs
		sendMessage: asyncThrowError as ExtensionRuntime["sendMessage"],
		sendUserMessage: asyncThrowError as ExtensionRuntime["sendUserMessage"],
		appendEntry: asyncThrowError as ExtensionRuntime["appendEntry"],
		setSessionName: asyncThrowError as ExtensionRuntime["setSessionName"],
		getSessionName: throwError as unknown as ExtensionRuntime["getSessionName"],
		setLabel: asyncThrowError as ExtensionRuntime["setLabel"],
		getActiveTools: throwError as ExtensionRuntime["getActiveTools"],
		getAllTools: throwError as ExtensionRuntime["getAllTools"],
		setActiveTools: asyncThrowError as ExtensionRuntime["setActiveTools"],
		refreshTools: asyncThrowError as ExtensionRuntime["refreshTools"],
		getCommands: throwError as ExtensionRuntime["getCommands"],
		setModel: asyncThrowError as ExtensionRuntime["setModel"],
		getThinkingLevel: throwError as ExtensionRuntime["getThinkingLevel"],
		setThinkingLevel: throwError as ExtensionRuntime["setThinkingLevel"],
	};
}

/**
 * Collects extension registrations from extension factories.
 * Creates an Extension object with all registered items.
 * Uses unknown types internally to handle complex ExtensionAPI generics.
 */
function collectExtensionFromFactory(
	factory: ExtensionFactory,
	path: string,
): Extension {
	const handlers = new Map<unknown, unknown[]>();
	const tools = new Map<string, unknown>();
	const messageRenderers = new Map<string, unknown>();
	const commands = new Map<string, unknown>();
	const flags = new Map<string, unknown>();
	const shortcuts = new Map<unknown, unknown>();

	// Create a minimal ExtensionAPI for the factory to register items
	// Using unknown and type assertions to bypass complex generic types
	const api = {
		registerTool: (tool: unknown) => {
			const t = tool as { name: string };
			// SDK expects RegisteredTool structure: { definition, extensionPath }
			tools.set(t.name, {
				definition: tool,
				extensionPath: path,
			});
		},
		registerCommand: (name: string, options: unknown) => {
			// Command is stored as RegisteredCommand with name included
			commands.set(name, {
				name,
				...(options as object),
			});
		},
		registerHandler: (event: string, handler: unknown) => {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			(handlers.get(event) as unknown[]).push(handler);
		},
		registerFlag: (name: string, options: unknown) => {
			// ExtensionFlag requires extensionPath
			flags.set(name, {
				name,
				...(options as object),
				extensionPath: path,
			});
		},
		registerShortcut: (key: unknown, options: unknown) => {
			// ExtensionShortcut requires extensionPath and shortcut field
			shortcuts.set(key, {
				shortcut: key,
				...(options as object),
				extensionPath: path,
			});
		},
		registerMessageRenderer: (name: string, renderer: unknown) => {
			messageRenderers.set(name, renderer);
		},
		// Add other required API methods as no-ops
		on: () => () => {},
		once: () => {},
		off: () => {},
		emit: async () => ({}),
		setEditorComponent: () => {},
		setFooterComponent: () => {},
		setStatusLineComponent: () => {},
		setHeaderComponent: () => {},
		setOverlayComponent: () => {},
		hooks: {
			registerNewSessionHook: () => {},
			registerSwitchSessionHook: () => {},
			registerBeforeSendHook: () => {},
			registerAfterSendHook: () => {},
			registerBeforeReloadHook: () => {},
		},
		sendMessage: async () => ({}),
		sendUserMessage: async () => ({}),
		appendEntry: async () => {},
		events: { on: () => () => {}, emit: async () => ({}), off: () => {} },
		editor: undefined,
	};

	// Invoke the factory with our minimal API
	try {
		factory(api as unknown as ExtensionAPI);
	} catch (err) {
		console.warn(`[ScopedResourceLoader] Extension factory failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	return {
		path,
		resolvedPath: path,
		handlers: handlers as Extension["handlers"],
		tools: tools as Extension["tools"],
		messageRenderers: messageRenderers as Extension["messageRenderers"],
		commands: commands as Extension["commands"],
		flags: flags as Extension["flags"],
		shortcuts: shortcuts as Extension["shortcuts"],
	};
}

// ─── Scoped Resource Loader ───────────────────────────────────────────────────

export class ScopedResourceLoader implements ResourceLoader {
	private cwd: string;
	private agentDir: string;
	private settingsManager?: SettingsManager;
	private extensionFactories: ExtensionFactory[];

	// Cached resources
	private extensionsResult: LoadExtensionsResult = {
		extensions: [],
		errors: [],
		runtime: createStubExtensionRuntime(),
	};
	private skills: Skill[] = [];
	private skillDiagnostics: ResourceDiagnostic[] = [];
	private prompts: PromptTemplate[] = [];
	private promptDiagnostics: ResourceDiagnostic[] = [];
	private themes: Theme[] = [];
	private themeDiagnostics: ResourceDiagnostic[] = [];
	private agentsFiles: Array<{ path: string; content: string }> = [];
	private systemPrompt?: string;
	private appendSystemPrompt: string[] = [];
	private pathMetadata: Map<string, PathMetadata> = new Map();

	constructor(options: ScopedResourceLoaderOptions) {
		this.cwd = resolve(options.cwd);
		this.agentDir = resolve(expandHome(options.agentDir));
		this.settingsManager = options.settingsManager;
		this.extensionFactories = options.extensionFactories ?? [];
	}

	async reload(): Promise<void> {
		// Reset state
		this.skills = [];
		this.skillDiagnostics = [];
		this.prompts = [];
		this.promptDiagnostics = [];
		this.themes = [];
		this.themeDiagnostics = [];
		this.agentsFiles = [];
		this.systemPrompt = undefined;
		this.appendSystemPrompt = [];
		this.pathMetadata = new Map();

		// Load skills from:
		// 1. agentDir/skills/ (e.g., ~/.clankie/skills/)
		// 2. cwd/.pi/skills/
		// 3. cwd/.agents/skills/
		await this.loadSkills();

		// Load prompts from:
		// 1. agentDir/prompts/
		// 2. cwd/.pi/prompts/
		await this.loadPrompts();

		// Load context files (AGENTS.md)
		await this.loadContextFiles();

		// Load themes from agentDir/themes/
		await this.loadThemes();

		// Load extensions from:
		// 1. agentDir/extensions/
		// 2. cwd/.pi/extensions/
		await this.loadExtensions();
	}

	private createPathMetadata(
		source: string,
		scope: "user" | "project" | "temporary",
		baseDir?: string,
	): PathMetadata {
		return {
			source,
			scope,
			origin: "top-level",
			baseDir,
		};
	}

	private async loadSkills(): Promise<void> {
		const skillDirs = [
			join(this.agentDir, "skills"),
			join(this.cwd, ".pi", "skills"),
			join(this.cwd, ".agents", "skills"),
		];

		const seenNames = new Set<string>();

		for (const dir of skillDirs) {
			if (!exists(dir)) continue;

			const skillFiles = findSkillFiles(dir);
			for (const { filePath, baseDir } of skillFiles) {
				const skill = parseSkillFile(filePath, baseDir);
				if (skill && !seenNames.has(skill.name)) {
					seenNames.add(skill.name);
					this.skills.push(skill);
					this.pathMetadata.set(
						filePath,
						this.createPathMetadata(
							"local",
							dir.includes(this.cwd) ? "project" : "user",
							baseDir,
						),
					);
				}
			}
		}
	}

	private async loadPrompts(): Promise<void> {
		const promptDirs = [
			join(this.agentDir, "prompts"),
			join(this.cwd, ".pi", "prompts"),
		];

		const seenNames = new Set<string>();

		for (const dir of promptDirs) {
			if (!exists(dir)) continue;

			const promptFiles = findPromptFiles(dir);
			for (const { filePath, name } of promptFiles) {
				if (seenNames.has(name)) continue;

				const prompt = parsePromptFile(filePath, name);
				if (prompt) {
					seenNames.add(name);
					this.prompts.push(prompt);
					this.pathMetadata.set(
						filePath,
						this.createPathMetadata("local", dir.includes(this.cwd) ? "project" : "user"),
					);
				}
			}
		}
	}

	private async loadContextFiles(): Promise<void> {
		// Global context file (lowest priority)
		const globalFiles = findGlobalContextFile(this.agentDir);
		this.agentsFiles.push(...globalFiles);

		// Project context files (walking up from cwd, highest priority)
		const projectFiles = findContextFiles(this.cwd);
		this.agentsFiles.push(...projectFiles);

		// Load system prompt override if exists
		const systemPromptPath = join(this.agentDir, "SYSTEM.md");
		const systemContent = readFileSafe(systemPromptPath);
		if (systemContent) {
			this.systemPrompt = systemContent;
		}

		// Load append system prompt if exists
		const appendPath = join(this.agentDir, "APPEND_SYSTEM.md");
		const appendContent = readFileSafe(appendPath);
		if (appendContent) {
			this.appendSystemPrompt.push(appendContent);
		}
	}

	private async loadThemes(): Promise<void> {
		const themesDir = join(this.agentDir, "themes");
		if (!exists(themesDir)) return;

		const entries = readDirSafe(themesDir);
		for (const entry of entries) {
			if (!entry.endsWith(".json")) continue;

			const filePath = join(themesDir, entry);
			const content = readFileSafe(filePath);
			if (!content) continue;

			try {
				const themeData = JSON5.parse(content);
				const name = entry.slice(0, -5); // Remove .json
				this.themes.push({
					name,
					...themeData,
				} as Theme);
				this.pathMetadata.set(filePath, this.createPathMetadata("local", "user"));
			} catch (err) {
				this.themeDiagnostics.push({
					type: "error",
					path: filePath,
					message: `Failed to parse theme: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}
	}

	private async loadExtensions(): Promise<void> {
		const errors: Array<{ path: string; error: string }> = [];
		const extensionPaths: string[] = [];
		const extensions: Extension[] = [];

		// 1. Extension factories (built-in, from code) - e.g., cron, heartbeat, workspace-jail
		for (let i = 0; i < this.extensionFactories.length; i++) {
			const factory = this.extensionFactories[i];
			// Extract name from function name or use index as fallback
			const factoryName = factory.name || `builtin-${i}`;
			const path = `clankie:${factoryName}`;
			const extension = collectExtensionFromFactory(factory, path);
			extensions.push(extension);
		}

		// 2. File-based extensions from agentDir/extensions/
		const globalExtDir = join(this.agentDir, "extensions");
		if (exists(globalExtDir)) {
			const entries = readDirSafe(globalExtDir);
			for (const entry of entries) {
				const fullPath = join(globalExtDir, entry);
				if (entry.endsWith(".ts") || entry.endsWith(".js")) {
					extensionPaths.push(fullPath);
					this.pathMetadata.set(fullPath, this.createPathMetadata("local", "user"));
				} else if (isDirectory(fullPath)) {
					// Check for index.ts/js in subdirectory
					const indexTs = join(fullPath, "index.ts");
					const indexJs = join(fullPath, "index.js");
					if (exists(indexTs)) {
						extensionPaths.push(indexTs);
						this.pathMetadata.set(indexTs, this.createPathMetadata("local", "user", fullPath));
					} else if (exists(indexJs)) {
						extensionPaths.push(indexJs);
						this.pathMetadata.set(indexJs, this.createPathMetadata("local", "user", fullPath));
					}
				}
			}
		}

		// 3. File-based extensions from cwd/.pi/extensions/
		const projectExtDir = join(this.cwd, ".pi", "extensions");
		if (exists(projectExtDir)) {
			const entries = readDirSafe(projectExtDir);
			for (const entry of entries) {
				const fullPath = join(projectExtDir, entry);
				if (entry.endsWith(".ts") || entry.endsWith(".js")) {
					extensionPaths.push(fullPath);
					this.pathMetadata.set(fullPath, this.createPathMetadata("local", "project"));
				} else if (isDirectory(fullPath)) {
					const indexTs = join(fullPath, "index.ts");
					const indexJs = join(fullPath, "index.js");
					if (exists(indexTs)) {
						extensionPaths.push(indexTs);
						this.pathMetadata.set(indexTs, this.createPathMetadata("local", "project", fullPath));
					} else if (exists(indexJs)) {
						extensionPaths.push(indexJs);
						this.pathMetadata.set(indexJs, this.createPathMetadata("local", "project", fullPath));
					}
				}
			}
		}

		// Create Extension objects from file paths
		// Note: The actual extension code loading happens in the SDK's createAgentSession
		for (const path of extensionPaths) {
			extensions.push({
				path,
				resolvedPath: path,
				handlers: new Map(),
				tools: new Map(),
				messageRenderers: new Map(),
				commands: new Map(),
				flags: new Map(),
				shortcuts: new Map(),
			});
		}

		this.extensionsResult = {
			extensions,
			errors,
			runtime: createStubExtensionRuntime(),
		};
	}

	// ─── ResourceLoader Interface Methods ───────────────────────────────────────

	getExtensions(): LoadExtensionsResult {
		return this.extensionsResult;
	}

	getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
		return { skills: this.skills, diagnostics: this.skillDiagnostics };
	}

	getPrompts(): { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] } {
		return { prompts: this.prompts, diagnostics: this.promptDiagnostics };
	}

	getThemes(): { themes: Theme[]; diagnostics: ResourceDiagnostic[] } {
		return { themes: this.themes, diagnostics: this.themeDiagnostics };
	}

	getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> } {
		return { agentsFiles: this.agentsFiles };
	}

	getSystemPrompt(): string | undefined {
		return this.systemPrompt;
	}

	getAppendSystemPrompt(): string[] {
		return this.appendSystemPrompt;
	}

	getPathMetadata(): Map<string, PathMetadata> {
		return this.pathMetadata;
	}

	extendResources(_paths: unknown): void {
		// Not implemented for scoped loader - resources are discovered at reload time
	}
}

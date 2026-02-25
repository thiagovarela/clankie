#!/usr/bin/env bun

/**
 * clankie — CLI entry point
 *
 * Commands:
 *   clankie send "<message>"            Send a message, print response, exit
 *   clankie chat                        Interactive chat session (full pi TUI)
 *   clankie login                       Authenticate with your AI provider
 *   clankie start                       Start the daemon (channels + agent)
 *   clankie stop                        Stop the daemon
 *   clankie status                      Check daemon status
 *   clankie config show                 Show current configuration
 *   clankie config get <path>           Get a config value by dot-path
 *   clankie config set <path> <value>   Set a config value by dot-path
 *   clankie config unset <path>         Remove a config value
 *   clankie persona                     Show loaded persona files
 *   clankie persona init                Create starter persona files
 *   clankie persona edit <file>         Open a persona file in $EDITOR
 *   clankie memory                      Show memory statistics
 *   clankie memory search <query>       Search memories
 *   clankie memory list [category]      List memories
 *   clankie memory export               Export core memories as JSON
 *   clankie cron list                   List scheduled jobs
 *   clankie cron remove <id>            Remove a scheduled job
 */

import * as readline from "node:readline/promises";
import { AuthStorage, InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";
import JSON5 from "json5";
import { createSession } from "./agent.ts";
import {
	getAppDir,
	getAuthPath,
	getByPath,
	getConfigPath,
	loadConfig,
	saveConfig,
	setByPath,
	unsetByPath,
} from "./config.ts";
import { isRunning, startDaemon, stopDaemon } from "./daemon.ts";
import { installService, showServiceLogs, showServiceStatus, uninstallService } from "./service.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printHelp(): void {
	console.log(`clankie — minimal personal AI assistant

Usage:
  clankie send [--persona <name>] "<message>"  Send a message, print response, exit
  clankie chat [--persona <name>]              Start interactive chat session
  clankie login                                Authenticate with your AI provider
  clankie start [--foreground]                 Start the daemon (foreground by default)
  clankie stop                                 Stop the daemon
  clankie status                               Check if daemon is running
  clankie daemon install                       Install as a system service (systemd/launchd)
  clankie daemon uninstall                     Remove the system service
  clankie daemon logs                          Show daemon logs
  clankie daemon status                        Show service status
  clankie persona                              List all personas
  clankie persona show [name]                  Show persona files (default: active)
  clankie persona create <name>                Create a new persona
  clankie persona edit [name] [file]           Edit persona files in $EDITOR
  clankie persona remove <name>                Delete a persona (cannot delete "default")
  clankie persona path [name]                  Show persona directory path
  clankie memory                        Show memory statistics
  clankie memory search <query>         Search memories (FTS5)
  clankie memory list [category]        List memories
  clankie memory export                 Export core memories as JSON
  clankie cron list                     List all scheduled jobs
  clankie cron remove <id>              Remove a scheduled job
  clankie config show                   Show current configuration
  clankie config get <path>             Get a config value (dot-path)
  clankie config set <path> <value>     Set a config value (dot-path)
  clankie config unset <path>           Remove a config value
  clankie --help, -h                    Show this help

Config file: ~/.clankie/clankie.json (JSON5 — comments and trailing commas allowed)

Config paths (dot-separated):
  agent.persona                     Default persona name (default: "default")
  agent.workspace                   Agent working directory
  agent.agentDir                    Override pi's agent dir
  agent.model.primary               Primary model (provider/model format)
  agent.model.fallbacks             Fallback models (JSON array)
  channels.slack.persona            Persona for Slack (overrides agent.persona)
  channels.slack.channelPersonas    Per-channel persona mapping (JSON object: {"C123": "engineer"})
  channels.slack.appToken           Slack app token (xapp-...) for Socket Mode
  channels.slack.botToken           Slack bot token (xoxb-...) for API calls
  channels.slack.allowFrom          Allowed Slack user IDs (JSON array of strings)
  channels.slack.enabled            Enable/disable Slack (default: true)

Slack slash commands (when running as daemon):
  /persona                          Show current persona for this channel
  /persona <name>                   Switch to a different persona
  /persona reset                    Reset to the configured default
  /switch <name>                    Switch to a different session
  /sessions                         List all sessions
  /new                              Start a fresh session

Examples:
  clankie login
  clankie config set channels.slack.appToken "xapp-..."
  clankie config set channels.slack.botToken "xoxb-..."
  clankie config set channels.slack.allowFrom ["U12345678"]
  clankie start                         # run in foreground
  clankie daemon install                # install as system service (auto-start on boot)
  clankie daemon logs                   # tail daemon logs

Credentials are stored at ~/.clankie/auth.json (separate from pi's auth).
`);
}

function printVersion(): void {
	// Read version from package.json at repo root (../ from src/)
	const packagePath = join(import.meta.dir, "..", "package.json");
	try {
		const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
		console.log(`clankie ${pkg.version}`);
	} catch {
		console.log("clankie (version unknown)");
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract --persona flag from args, returning { persona, remainingArgs }
 */
function extractPersonaFlag(args: string[]): { persona?: string; remainingArgs: string[] } {
	const personaIndex = args.indexOf("--persona");
	if (personaIndex === -1) {
		return { remainingArgs: args };
	}

	const persona = args[personaIndex + 1];
	if (!persona || persona.startsWith("-")) {
		console.error("Error: --persona requires a name argument");
		process.exit(1);
	}

	const remainingArgs = [...args.slice(0, personaIndex), ...args.slice(personaIndex + 2)];
	return { persona, remainingArgs };
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function cmdSend(args: string[]): Promise<void> {
	const { persona, remainingArgs } = extractPersonaFlag(args);
	const message = remainingArgs.join(" ").trim();
	if (!message) {
		console.error('Error: no message provided.\n\nUsage: clankie send [--persona <name>] "<message>"');
		process.exit(1);
	}

	const { session, modelFallbackMessage } = await createSession({ ephemeral: false, persona });

	if (modelFallbackMessage) {
		console.warn(`Warning: ${modelFallbackMessage}`);
	}

	await runPrintMode(session, {
		mode: "text",
		initialMessage: message,
	});
}

async function cmdChat(args: string[]): Promise<void> {
	const { persona, remainingArgs } = extractPersonaFlag(args);
	const initialMessage = remainingArgs.join(" ").trim() || undefined;

	const { session, modelFallbackMessage } = await createSession({
		continueRecent: true,
		persona,
	});

	const mode = new InteractiveMode(session, {
		modelFallbackMessage,
		initialMessage,
	});

	await mode.run();
}

async function cmdLogin(_args: string[]): Promise<void> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	const authStorage = AuthStorage.create(getAuthPath());

	const oauthProviders = authStorage.getOAuthProviders();
	const oauthIds = new Set(oauthProviders.map((p) => p.id));

	const apiKeyProviders = [
		{ id: "anthropic", name: "Anthropic" },
		{ id: "openai", name: "OpenAI" },
		{ id: "google", name: "Google (Gemini)" },
		{ id: "xai", name: "xAI (Grok)" },
		{ id: "groq", name: "Groq" },
		{ id: "openrouter", name: "OpenRouter" },
		{ id: "mistral", name: "Mistral" },
	].filter((p) => !oauthIds.has(p.id));

	const entries: { id: string; name: string; type: "oauth" | "apikey"; hasAuth: boolean }[] = [];

	for (const p of oauthProviders) {
		entries.push({ id: p.id, name: p.name, type: "oauth", hasAuth: authStorage.hasAuth(p.id) });
	}
	for (const p of apiKeyProviders) {
		entries.push({ id: p.id, name: p.name, type: "apikey", hasAuth: authStorage.hasAuth(p.id) });
	}

	console.log("\nAvailable providers:\n");
	entries.forEach((e, i) => {
		const status = e.hasAuth ? " ✓" : "";
		const kind = e.type === "oauth" ? "(OAuth)" : "(API key)";
		console.log(`  ${i + 1}. ${e.name} ${kind}${status}`);
	});
	console.log();

	const answer = await rl.question("Select provider (number): ");
	const idx = parseInt(answer, 10) - 1;

	if (Number.isNaN(idx) || idx < 0 || idx >= entries.length) {
		console.error("Invalid selection.");
		rl.close();
		process.exit(1);
	}

	const selected = entries[idx];

	if (selected.type === "apikey") {
		const key = await rl.question(`Enter API key for ${selected.name}: `);
		if (!key.trim()) {
			console.error("No key provided. Aborting.");
			rl.close();
			process.exit(1);
		}
		authStorage.set(selected.id, { type: "api_key", key: key.trim() });
		console.log(`\n✓ API key saved for ${selected.name}.`);
		rl.close();
		return;
	}

	console.log(`\nStarting OAuth login for ${selected.name}...\n`);

	try {
		await authStorage.login(selected.id, {
			onAuth: (info) => {
				console.log(`Open this URL in your browser:\n\n  ${info.url}\n`);
				if (info.instructions) {
					console.log(info.instructions);
					console.log();
				}
			},
			onPrompt: async (prompt) => {
				const response = await rl.question(`${prompt.message} `);
				return response;
			},
			onProgress: (message) => {
				console.log(message);
			},
			onManualCodeInput: async () => {
				const code = await rl.question("Paste the authorization code/URL here: ");
				return code;
			},
		});
		console.log(`\n✓ Successfully logged in to ${selected.name}.`);
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			console.log("\nLogin cancelled.");
		} else {
			console.error(`\nLogin failed: ${err instanceof Error ? err.message : String(err)}`);
			rl.close();
			process.exit(1);
		}
	}

	rl.close();
}

async function cmdStart(_args: string[]): Promise<void> {
	const status = isRunning();
	if (status.running) {
		console.log(`Daemon is already running (pid ${status.pid}).`);
		process.exit(0);
	}
	await startDaemon();
}

function cmdStop(): void {
	stopDaemon();
}

function cmdStatus(): void {
	const status = isRunning();
	if (status.running) {
		console.log(`Daemon is running (pid ${status.pid}).`);
	} else {
		console.log("Daemon is not running.");
	}
}

async function cmdDaemon(args: string[]): Promise<void> {
	const [sub] = args;

	if (!sub) {
		console.error("Usage: clankie daemon install | uninstall | logs | status");
		process.exit(1);
	}

	switch (sub) {
		case "install":
			await installService();
			break;
		case "uninstall":
			await uninstallService();
			break;
		case "logs":
			showServiceLogs();
			break;
		case "status":
			showServiceStatus();
			break;
		default:
			console.error(`Unknown daemon subcommand "${sub}".\n\nUsage: clankie daemon install | uninstall | logs | status`);
			process.exit(1);
	}
}

async function cmdConfig(args: string[]): Promise<void> {
	const [sub, ...rest] = args;

	// clankie config show (or just `clankie config`)
	if (!sub || sub === "show") {
		const config = loadConfig();
		if (Object.keys(config).length === 0) {
			console.log(`No configuration set.\nConfig file: ${getConfigPath()}\n`);
		} else {
			console.log(`# ${getConfigPath()}\n`);
			console.log(JSON5.stringify(config, null, 2));
			console.log();
		}
		return;
	}

	// clankie config get <path>
	if (sub === "get") {
		const [path] = rest;
		if (!path) {
			console.error("Usage: clankie config get <path>\n\nExample: clankie config get channels.slack.botToken");
			process.exit(1);
		}
		const config = loadConfig();
		const value = getByPath(config, path);
		if (value === undefined) {
			console.log("(not set)");
		} else {
			console.log(typeof value === "object" ? JSON5.stringify(value, null, 2) : String(value));
		}
		return;
	}

	// clankie config set <path> <value>
	if (sub === "set") {
		const [path, ...valueParts] = rest;
		if (!path) {
			console.error(
				'Usage: clankie config set <path> <value>\n\nExample: clankie config set channels.slack.botToken "xoxb-..."',
			);
			process.exit(1);
		}
		const rawValue = valueParts.join(" ");
		if (!rawValue) {
			console.error(`Error: missing value for "${path}".`);
			process.exit(1);
		}

		// Try to parse as JSON5 (handles arrays, numbers, booleans, objects)
		// Fall back to raw string if parsing fails
		let value: unknown;
		try {
			value = JSON5.parse(rawValue);
		} catch {
			value = rawValue;
		}

		const config = loadConfig();
		const updated = setByPath(config, path, value);
		saveConfig(updated);
		console.log(`Set ${path} = ${JSON5.stringify(value)}`);
		return;
	}

	// clankie config unset <path>
	if (sub === "unset") {
		const [path] = rest;
		if (!path) {
			console.error("Usage: clankie config unset <path>");
			process.exit(1);
		}
		const config = loadConfig();
		const updated = unsetByPath(config, path);
		saveConfig(updated);
		console.log(`Removed ${path}`);
		return;
	}

	// clankie config path
	if (sub === "path") {
		console.log(getConfigPath());
		return;
	}

	console.error(
		`Unknown config subcommand "${sub}".\n\nUsage: clankie config show | get <path> | set <path> <value> | unset <path>`,
	);
	process.exit(1);
}

// ─── Persona management ───────────────────────────────────────────────────────

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPersonaDir, getPersonasDir, resolvePersonaModel } from "./config.ts";

function getPersonaStarters(personaName: string): Record<string, string> {
	return {
		"identity.md": `# Identity

You are **clankie (${personaName})**, a personal AI assistant.

- You are direct, concise, and helpful
- You have a warm but no-nonsense personality
- You don't over-explain or pad responses with filler
- You use casual language but stay precise on technical matters
- When you don't know something, you say so plainly
`,
		"instructions.md": `# Instructions

- Keep responses short unless asked for detail
- When coding, prefer working solutions over perfect ones — iterate
- Don't repeat back what the user just said
- If a task is ambiguous, pick the most likely interpretation and go — ask only if truly stuck
- Use the \`remember\` tool when the user shares preferences, facts, or context worth keeping
`,
		"knowledge.md": `# User Knowledge

<!-- Add facts about yourself here so clankie knows your context -->
- Name: (your name)
- Stack: (your tech stack)
- Current project: (what you're working on)
`,
		"persona.json": `{
  // Optional: override the global model for this persona
  // "model": "anthropic/claude-sonnet-4-5"
}
`,
	};
}

async function cmdPersona(args: string[]): Promise<void> {
	const [sub, ...rest] = args;
	const personasDir = getPersonasDir();

	// clankie persona (no subcommand) — list all personas
	if (!sub || sub === "list") {
		const personas = existsSync(personasDir)
			? readdirSync(personasDir).filter((name) => {
					const stat = require("node:fs").statSync(join(personasDir, name));
					return stat.isDirectory();
				})
			: [];

		if (personas.length === 0) {
			console.log("No personas found.");
			console.log(`\nCreate one with: clankie persona create default`);
			return;
		}

		console.log(`Personas (${personas.length}):\n`);
		const config = loadConfig();
		const defaultPersona = config.agent?.persona ?? "default";

		for (const name of personas.sort()) {
			const personaDir = getPersonaDir(name);
			const files = existsSync(personaDir) ? readdirSync(personaDir).filter((f) => f.endsWith(".md")) : [];

			const isDefault = name === defaultPersona;
			const marker = isDefault ? " ✓ (default)" : "";
			console.log(`  📁 ${name}${marker}`);

			// Show file count and model if set
			const details: string[] = [`${files.length} files`];
			const model = resolvePersonaModel(name);
			if (model) {
				details.push(`model: ${model}`);
			}
			console.log(`     ${details.join(", ")}\n`);
		}
		return;
	}

	// clankie persona show [name] — show persona files
	if (sub === "show") {
		const personaName = rest[0] ?? loadConfig().agent?.persona ?? "default";

		let personaDir: string;
		try {
			personaDir = getPersonaDir(personaName);
		} catch (err) {
			console.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}

		if (!existsSync(personaDir)) {
			console.error(`Persona "${personaName}" not found at ${personaDir}`);
			console.log(`\nCreate it with: clankie persona create ${personaName}`);
			process.exit(1);
		}

		const files = readdirSync(personaDir).filter((f) => f.endsWith(".md") || f === "persona.json");

		if (files.length === 0) {
			console.log(`Persona "${personaName}" exists but has no files.`);
			return;
		}

		console.log(`Persona: ${personaName}\n`);
		for (const file of files.sort()) {
			const filePath = join(personaDir, file);
			const content = readFileSync(filePath, "utf-8").trim();
			const preview =
				content.length > 100 ? `${content.slice(0, 100).replace(/\n/g, " ")}...` : content.replace(/\n/g, " ");
			console.log(`  📄 ${file}`);
			console.log(`     ${preview}\n`);
		}
		return;
	}

	// clankie persona create <name> — create a new persona
	if (sub === "create") {
		const personaName = rest[0];
		if (!personaName) {
			console.error("Usage: clankie persona create <name>");
			process.exit(1);
		}

		let personaDir: string;
		try {
			personaDir = getPersonaDir(personaName);
		} catch (err) {
			console.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}

		if (existsSync(personaDir)) {
			console.error(`Persona "${personaName}" already exists at ${personaDir}`);
			process.exit(1);
		}

		mkdirSync(personaDir, { recursive: true, mode: 0o700 });

		const starters = getPersonaStarters(personaName);
		for (const [filename, content] of Object.entries(starters)) {
			writeFileSync(join(personaDir, filename), content, "utf-8");
		}

		console.log(`✓ Created persona "${personaName}"`);
		console.log(`  Files: ${Object.keys(starters).join(", ")}`);
		console.log(`  Path: ${personaDir}`);
		console.log(`\nEdit with: clankie persona edit ${personaName}`);
		return;
	}

	// clankie persona edit [name] [file] — edit persona files
	if (sub === "edit") {
		const editor = process.env.EDITOR || process.env.VISUAL || "nano";
		let personaName = rest[0];
		let file = rest[1];

		// If only one arg and it ends with .md or .json, treat it as a file for the default persona
		if (rest.length === 1 && (rest[0].endsWith(".md") || rest[0].endsWith(".json"))) {
			personaName = loadConfig().agent?.persona ?? "default";
			file = rest[0];
		}

		if (!personaName) {
			personaName = loadConfig().agent?.persona ?? "default";
		}

		let personaDir: string;
		try {
			personaDir = getPersonaDir(personaName);
		} catch (err) {
			console.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}

		if (!existsSync(personaDir)) {
			console.error(`Persona "${personaName}" not found.`);
			console.log(`\nCreate it with: clankie persona create ${personaName}`);
			process.exit(1);
		}

		if (file) {
			const filePath = join(personaDir, file);
			if (!existsSync(filePath)) {
				console.error(`File not found: ${filePath}`);
				const available = readdirSync(personaDir)
					.filter((f) => f.endsWith(".md") || f === "persona.json")
					.join(", ");
				console.log(`\nAvailable files: ${available || "(none)"}`);
				process.exit(1);
			}
			execSync(`${editor} "${filePath}"`, { stdio: "inherit" });
		} else {
			// Open the whole directory
			execSync(`${editor} "${personaDir}"`, { stdio: "inherit" });
		}
		return;
	}

	// clankie persona remove <name> — delete a persona
	if (sub === "remove") {
		const personaName = rest[0];
		if (!personaName) {
			console.error("Usage: clankie persona remove <name>");
			process.exit(1);
		}

		if (personaName === "default") {
			console.error('Cannot remove the "default" persona.');
			process.exit(1);
		}

		let personaDir: string;
		try {
			personaDir = getPersonaDir(personaName);
		} catch (err) {
			console.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}

		if (!existsSync(personaDir)) {
			console.error(`Persona "${personaName}" not found.`);
			process.exit(1);
		}

		// Confirm
		const readline = require("node:readline/promises");
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const answer = await rl.question(`Delete persona "${personaName}"? [y/N] `);
		rl.close();

		if (answer.toLowerCase() !== "y") {
			console.log("Cancelled.");
			return;
		}

		rmSync(personaDir, { recursive: true, force: true });
		console.log(`✓ Removed persona "${personaName}"`);
		return;
	}

	// clankie persona path [name] — show persona directory
	if (sub === "path") {
		const personaName = rest[0] ?? loadConfig().agent?.persona ?? "default";
		try {
			console.log(getPersonaDir(personaName));
		} catch (err) {
			console.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}
		return;
	}

	console.error(`Unknown persona subcommand "${sub}".

Usage:
  clankie persona                       List all personas
  clankie persona show [name]           Show persona files
  clankie persona create <name>         Create a new persona
  clankie persona edit [name] [file]    Edit persona files
  clankie persona remove <name>         Delete a persona
  clankie persona path [name]           Show persona directory`);
	process.exit(1);
}

// ─── Memory management ────────────────────────────────────────────────────────

import { MemoryDB } from "./extensions/persona/memory-db.ts";

const MEMORY_DB_PATH = join(getAppDir(), "memory.db");

async function cmdMemory(args: string[]): Promise<void> {
	// Extract --persona flag
	let personaName: string | null = null;
	let filteredArgs = args;
	const personaIndex = args.indexOf("--persona");
	if (personaIndex !== -1 && args[personaIndex + 1]) {
		personaName = args[personaIndex + 1];
		filteredArgs = [...args.slice(0, personaIndex), ...args.slice(personaIndex + 2)];
	}

	const [sub, ...rest] = filteredArgs;
	const db = new MemoryDB(MEMORY_DB_PATH);

	try {
		// clankie memory (or clankie memory stats) — show statistics
		if (!sub || sub === "stats") {
			const stats = db.stats(personaName);
			console.log(`Memory database: ${MEMORY_DB_PATH}\n`);
			if (personaName) {
				console.log(`  Persona: ${personaName} (includes global memories)`);
			} else {
				console.log(`  Scope: All memories (use --persona <name> to filter)`);
			}
			console.log(`  Total entries: ${stats.total}`);
			if (Object.keys(stats.byCategory).length > 0) {
				console.log(`  By category:`);
				for (const [cat, count] of Object.entries(stats.byCategory)) {
					console.log(`    ${cat}: ${count}`);
				}
			}
			console.log();
			return;
		}

		// clankie memory search <query>
		if (sub === "search") {
			const query = rest.join(" ").trim();
			if (!query) {
				console.error("Usage: clankie memory search [--persona <name>] <query>");
				process.exit(1);
			}
			const results = db.recall(query, personaName, 10);
			if (results.length === 0) {
				console.log(`No memories found matching: "${query}"`);
				return;
			}
			console.log(`Found ${results.length} result(s):\n`);
			for (const entry of results) {
				const scope = entry.persona ? ` [${entry.persona}]` : " [global]";
				console.log(`  [${entry.category}]${scope} ${entry.key}`);
				console.log(`    ${entry.content}`);
				console.log(`    updated: ${entry.updatedAt}\n`);
			}
			return;
		}

		// clankie memory list [category]
		if (sub === "list") {
			const category = rest[0];
			const entries = db.list(category, personaName, 50);
			if (entries.length === 0) {
				console.log(category ? `No memories in category "${category}".` : "No memories stored.");
				return;
			}
			const scopeLabel = personaName ? ` for persona:${personaName}` : "";
			console.log(`Memories${category ? ` (${category})` : ""}${scopeLabel}: ${entries.length}\n`);
			for (const entry of entries) {
				const scope = entry.persona ? ` [${entry.persona}]` : " [global]";
				console.log(
					`  [${entry.category}]${scope} ${entry.key}: ${entry.content.slice(0, 80)}${entry.content.length > 80 ? "..." : ""}`,
				);
			}
			console.log();
			return;
		}

		// clankie memory export
		if (sub === "export") {
			const core = db.exportCore();
			const json = JSON.stringify(
				core.map((e) => ({ key: e.key, content: e.content, category: e.category })),
				null,
				2,
			);
			console.log(json);
			return;
		}

		// clankie memory forget <key>
		if (sub === "forget") {
			const key = rest[0];
			if (!key) {
				console.error("Usage: clankie memory forget <key>");
				process.exit(1);
			}
			const forgotten = db.forget(key);
			if (forgotten) {
				console.log(`Forgot memory: ${key}`);
			} else {
				console.log(`No memory found with key: ${key}`);
			}
			return;
		}

		console.error(
			`Unknown memory subcommand "${sub}".\n\nUsage: clankie memory [stats | search <query> | list [category] | export | forget <key>]`,
		);
		process.exit(1);
	} finally {
		db.close();
	}
}

// ─── Cron management ──────────────────────────────────────────────────────────

import { loadJobs, saveJobs } from "./extensions/cron/index.ts";

async function cmdCron(args: string[]): Promise<void> {
	const [sub, ...rest] = args;

	// clankie cron list
	if (!sub || sub === "list") {
		const jobs = loadJobs();
		const active = jobs.filter((j) => !j.completed);

		if (active.length === 0) {
			console.log("No scheduled tasks.");
			return;
		}

		console.log(`Scheduled tasks (${active.length}):\n`);
		for (const job of active) {
			const status = job.enabled ? "● active" : "○ paused";
			const nextStr = job.nextRun ? new Date(job.nextRun).toLocaleString() : "—";
			console.log(`  ${status}  ${job.id}  [${job.type}]`);
			console.log(`           ${job.description}`);
			console.log(`           schedule: ${job.schedule}  |  next: ${nextStr}\n`);
		}
		return;
	}

	// clankie cron remove <id>
	if (sub === "remove") {
		const id = rest[0];
		if (!id) {
			console.error("Usage: clankie cron remove <id>");
			process.exit(1);
		}
		const jobs = loadJobs();
		const idx = jobs.findIndex((j) => j.id === id);
		if (idx === -1) {
			console.error(`No job found with ID "${id}".`);
			process.exit(1);
		}
		const removed = jobs.splice(idx, 1)[0];
		saveJobs(jobs);
		console.log(`Removed: "${removed.description}" (${removed.id})`);
		return;
	}

	// clankie cron clear — remove all completed jobs
	if (sub === "clear") {
		const jobs = loadJobs();
		const before = jobs.length;
		const active = jobs.filter((j) => !j.completed);
		saveJobs(active);
		console.log(`Cleared ${before - active.length} completed job(s).`);
		return;
	}

	console.error(`Unknown cron subcommand "${sub}".\n\nUsage: clankie cron [list | remove <id> | clear]`);
	process.exit(1);
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const [command, ...rest] = args;

	if (!command || command === "--help" || command === "-h") {
		printHelp();
		process.exit(0);
	}

	if (command === "--version" || command === "-v") {
		printVersion();
		process.exit(0);
	}

	switch (command) {
		case "send":
			await cmdSend(rest);
			break;

		case "chat":
			await cmdChat(rest);
			break;

		case "login":
			await cmdLogin(rest);
			break;

		case "start":
			await cmdStart(rest);
			break;

		case "stop":
			cmdStop();
			break;

		case "status":
			cmdStatus();
			break;

		case "daemon":
			await cmdDaemon(rest);
			break;

		case "config":
			await cmdConfig(rest);
			break;

		case "persona":
			await cmdPersona(rest);
			break;

		case "memory":
			await cmdMemory(rest);
			break;

		case "cron":
			await cmdCron(rest);
			break;

		default:
			if (!command.startsWith("-")) {
				await cmdSend([command, ...rest]);
			} else {
				console.error(`Unknown flag: ${command}\n`);
				printHelp();
				process.exit(1);
			}
			break;
	}
}

main().catch((err) => {
	console.error("Fatal error:", err instanceof Error ? err.message : String(err));
	process.exit(1);
});

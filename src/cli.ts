#!/usr/bin/env node

/**
 * clankie — CLI entry point
 *
 * Commands:
 *   clankie send "<message>"            Send a message, print response, exit
 *   clankie login                       Authenticate with your AI provider
 *   clankie start                       Start the daemon (channels + agent)
 *   clankie stop                        Stop the daemon
 *   clankie restart                     Restart the daemon
 *   clankie status                      Check daemon status
 *   clankie daemon install              Install as a system service (systemd/launchd)
 *   clankie daemon uninstall            Remove the system service
 *   clankie daemon logs                 Show daemon logs
 *   clankie daemon status               Show service status
 *   clankie config show                 Show current configuration
 *   clankie config get <path>           Get a config value by dot-path
 *   clankie config set <path> <value>   Set a config value by dot-path
 *   clankie config unset <path>         Remove a config value
 *   clankie config path                 Show config file path
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import { AuthStorage, runPrintMode } from "@mariozechner/pi-coding-agent";
import JSON5 from "json5";
import { createSession } from "./agent.ts";
import { buildApiKeyProviders } from "./auth/providers.ts";
import { getAuthPath, getByPath, getConfigPath, loadConfig, saveConfig, setByPath, unsetByPath } from "./config.ts";
import { isRunning, restartDaemon, startDaemon, stopDaemon } from "./daemon.ts";
import { installService, showServiceLogs, showServiceStatus, uninstallService } from "./service.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printHelp(): void {
	console.log(`clankie — minimal personal AI assistant

Usage:
  clankie send "<message>"          Send a message, print response, exit
  clankie init                      Set up clankie (generates auth token, configures web channel)
  clankie login                     Authenticate with your AI provider
  clankie start [--foreground]      Start the daemon (foreground by default)
  clankie stop                      Stop the daemon
  clankie restart                   Restart the daemon
  clankie status                    Check if daemon is running
  clankie daemon install            Install as a system service (systemd/launchd)
  clankie daemon uninstall          Remove the system service
  clankie daemon logs               Show daemon logs
  clankie daemon status             Show service status
  clankie config show               Show current configuration
  clankie config get <path>         Get a config value (dot-path)
  clankie config set <path> <value> Set a config value (dot-path)
  clankie config unset <path>       Remove a config value
  clankie --help, -h                Show this help

Config file: ~/.clankie/clankie.json (JSON5 — comments and trailing commas allowed)

Config paths (dot-separated):
  agent.workspace                   Agent working directory
  agent.agentDir                    Override pi's agent dir
  agent.model.primary               Primary model (provider/model format)
  agent.model.fallbacks             Fallback models (JSON array)
  channels.web.authToken            Web channel auth token (required, shared secret)
  channels.web.port                 Web channel port (default: 3100)
  channels.web.allowedOrigins       Allowed origins (JSON array, empty = allow all)
  channels.web.staticDir            Path to built web-ui files (serves UI on same port)
  channels.web.enabled              Enable/disable web channel (default: true)

Session commands (when running as daemon):
  /switch <name>                    Switch to a different session
  /sessions                         List all sessions
  /new                              Start a fresh session

Examples:
  # Quick start
  clankie init                          # generates token, configures web channel
  clankie login                         # authenticate with AI provider
  clankie start                         # starts daemon, prints connect URL
  
  # Manual web channel setup (optional if using init)
  clankie config set channels.web.authToken "your-secret-token"
  clankie config set channels.web.port 3100
  
  # VPS deployment (same-origin, serve web-ui from daemon)
  clankie config set channels.web.staticDir "/path/to/web-ui/.output/public"
  
  # System service
  clankie daemon install                # install as system service (auto-start on boot)
  clankie daemon logs                   # tail daemon logs

Credentials are stored at ~/.clankie/auth.json (separate from pi's auth).
`);
}

function printVersion(): void {
	// Read version from package.json at repo root (../ from src/)
	const packagePath = join(import.meta.dirname, "..", "package.json");
	try {
		const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
		console.log(`clankie ${pkg.version}`);
	} catch {
		console.log("clankie (version unknown)");
	}
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function cmdSend(args: string[]): Promise<void> {
	const message = args.join(" ").trim();
	if (!message) {
		console.error('Error: no message provided.\n\nUsage: clankie send "<message>"');
		process.exit(1);
	}

	const { session, modelFallbackMessage } = await createSession({ ephemeral: false });

	if (modelFallbackMessage) {
		console.warn(`Warning: ${modelFallbackMessage}`);
	}

	await runPrintMode(session, {
		mode: "text",
		initialMessage: message,
	});
}

async function getApiKeyProvidersForLogin(oauthIds: Set<string>): Promise<Array<{ id: string; name: string }>> {
	const dynamicProviderIds = new Set<string>();

	try {
		const { session } = await createSession({ ephemeral: true });
		const allModels = session.modelRegistry.getAll();
		for (const model of allModels) {
			if (model.provider) dynamicProviderIds.add(model.provider);
		}
	} catch (err) {
		console.warn(`Warning: failed to discover dynamic providers: ${err instanceof Error ? err.message : String(err)}`);
	}

	return buildApiKeyProviders(oauthIds, dynamicProviderIds);
}

async function cmdLogin(_args: string[]): Promise<void> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	const authStorage = AuthStorage.create(getAuthPath());

	const oauthProviders = authStorage.getOAuthProviders();
	const oauthIds = new Set(oauthProviders.map((p) => p.id));

	const apiKeyProviders = await getApiKeyProvidersForLogin(oauthIds);

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

async function cmdInit(_args: string[]): Promise<void> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	console.log("clankie setup — configuring web channel\n");

	const config = loadConfig();
	const existingToken = config.channels?.web?.authToken;

	let authToken: string;

	if (existingToken) {
		console.log("✓ Web channel auth token already configured.\n");
		const answer = await rl.question("Regenerate token? (y/N): ");

		if (answer.trim().toLowerCase() === "y") {
			authToken = randomBytes(32).toString("base64url");
			console.log("\n✓ Generated new auth token.\n");
		} else {
			authToken = existingToken;
			console.log("\n✓ Keeping existing token.\n");
		}
	} else {
		authToken = randomBytes(32).toString("base64url");
		console.log("✓ Generated auth token for web channel.\n");
	}

	// Save web channel defaults to config
	const updated = {
		...config,
		channels: {
			...config.channels,
			web: {
				...config.channels?.web,
				authToken,
				port: config.channels?.web?.port ?? 3100,
				enabled: config.channels?.web?.enabled ?? true,
			},
		},
	};

	saveConfig(updated);

	console.log(`Configuration saved to ${getConfigPath()}\n`);
	console.log("Next steps:");
	console.log("  1. Run 'clankie login' to authenticate with an AI provider");
	console.log("  2. Run 'clankie start' to start the daemon");
	console.log("  3. Open the connect URL printed by the daemon\n");

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

async function cmdRestart(): Promise<void> {
	await restartDaemon();
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
			console.error("Usage: clankie config get <path>\n\nExample: clankie config get channels.web.authToken");
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
				'Usage: clankie config set <path> <value>\n\nExample: clankie config set channels.web.authToken "your-secret-token"',
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
			console.error("The 'chat' command has been removed. Use the Web UI or 'clankie send'.");
			process.exit(1);
			break;

		case "init":
			await cmdInit(rest);
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

		case "restart":
			await cmdRestart();
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

#!/usr/bin/env bun
/**
 * lil — CLI entry point
 *
 * Commands:
 *   lil send "<message>"            Send a message, print response, exit
 *   lil chat                        Interactive chat session (full pi TUI)
 *   lil login                       Authenticate with your AI provider
 *   lil start                       Start the daemon (channels + agent)
 *   lil stop                        Stop the daemon
 *   lil status                      Check daemon status
 *   lil config show                 Show current configuration
 *   lil config get <path>           Get a config value by dot-path
 *   lil config set <path> <value>   Set a config value by dot-path
 *   lil config unset <path>         Remove a config value
 *   lil persona                     Show loaded persona files
 *   lil persona init                Create starter persona files
 *   lil persona edit <file>         Open a persona file in $EDITOR
 *   lil memory                      Show memory statistics
 *   lil memory search <query>       Search memories
 *   lil memory list [category]      List memories
 *   lil memory export               Export core memories as JSON
 *   lil cron list                   List scheduled jobs
 *   lil cron remove <id>            Remove a scheduled job
 */

import { AuthStorage, InteractiveMode, runPrintMode } from "@mariozechner/pi-coding-agent";
import JSON5 from "json5";
import { createLilSession } from "./agent.ts";
import { loadConfig, saveConfig, getByPath, setByPath, unsetByPath, getConfigPath, getAuthPath, getLilDir } from "./config.ts";
import { isRunning, startDaemon, stopDaemon } from "./daemon.ts";
import { installService, uninstallService, showServiceLogs, showServiceStatus } from "./service.ts";
import * as readline from "node:readline/promises";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`lil — minimal personal AI assistant

Usage:
  lil send "<message>"              Send a message, print response, exit
  lil chat                          Start interactive chat session
  lil login                         Authenticate with your AI provider
  lil start [--foreground]          Start the daemon (foreground by default)
  lil stop                          Stop the daemon
  lil status                        Check if daemon is running
  lil daemon install                Install as a system service (systemd/launchd)
  lil daemon uninstall              Remove the system service
  lil daemon logs                   Show daemon logs
  lil daemon status                 Show service status
  lil persona                        Show loaded persona files
  lil persona init                  Create starter persona files
  lil persona edit <file>           Open a persona file in $EDITOR
  lil memory                        Show memory statistics
  lil memory search <query>         Search memories (FTS5)
  lil memory list [category]        List memories
  lil memory export                 Export core memories as JSON
  lil cron list                     List all scheduled jobs
  lil cron remove <id>              Remove a scheduled job
  lil config show                   Show current configuration
  lil config get <path>             Get a config value (dot-path)
  lil config set <path> <value>     Set a config value (dot-path)
  lil config unset <path>           Remove a config value
  lil --help, -h                    Show this help

Config file: ~/.lil/lil.json (JSON5 — comments and trailing commas allowed)

Config paths (dot-separated):
  agent.workspace                   Agent working directory
  agent.agentDir                    Override pi's agent dir
  agent.model.primary               Primary model (provider/model format)
  agent.model.fallbacks             Fallback models (JSON array)
  channels.telegram.botToken        Telegram bot token from @BotFather
  channels.telegram.allowFrom       Allowed Telegram user IDs (JSON array)
  channels.telegram.enabled         Enable/disable Telegram (default: true)
  web.enabled                       Enable/disable web UI server (default: true)
  web.host                          Web bind host (default: 127.0.0.1)
  web.port                          Web bind port (default: 3333)
  web.token                         Web auth token (auto-generated)

Examples:
  lil login
  lil config set channels.telegram.botToken "123456:ABC-DEF..."
  lil config set channels.telegram.allowFrom [123456789]
  lil config set web.enabled true
  lil start                         # run in foreground
  lil daemon install                # install as system service (auto-start on boot)
  lil daemon logs                   # tail daemon logs

Credentials are stored at ~/.lil/auth.json (separate from pi's auth).
`);
}

function printVersion(): void {
  console.log("lil 0.1.0");
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function cmdSend(args: string[]): Promise<void> {
  const message = args.join(" ").trim();
  if (!message) {
    console.error("Error: no message provided.\n\nUsage: lil send \"<message>\"");
    process.exit(1);
  }

  const { session, modelFallbackMessage } = await createLilSession({ ephemeral: false });

  if (modelFallbackMessage) {
    console.warn(`Warning: ${modelFallbackMessage}`);
  }

  await runPrintMode(session, {
    mode: "text",
    initialMessage: message,
  });
}

async function cmdChat(args: string[]): Promise<void> {
  const initialMessage = args.join(" ").trim() || undefined;

  const { session, modelFallbackMessage } = await createLilSession({
    continueRecent: true,
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

  if (isNaN(idx) || idx < 0 || idx >= entries.length) {
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
    console.error("Usage: lil daemon install | uninstall | logs | status");
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
      console.error(`Unknown daemon subcommand "${sub}".\n\nUsage: lil daemon install | uninstall | logs | status`);
      process.exit(1);
  }
}

async function cmdConfig(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  // lil config show (or just `lil config`)
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

  // lil config get <path>
  if (sub === "get") {
    const [path] = rest;
    if (!path) {
      console.error("Usage: lil config get <path>\n\nExample: lil config get channels.telegram.botToken");
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

  // lil config set <path> <value>
  if (sub === "set") {
    const [path, ...valueParts] = rest;
    if (!path) {
      console.error("Usage: lil config set <path> <value>\n\nExample: lil config set channels.telegram.botToken \"123:abc\"");
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

  // lil config unset <path>
  if (sub === "unset") {
    const [path] = rest;
    if (!path) {
      console.error("Usage: lil config unset <path>");
      process.exit(1);
    }
    const config = loadConfig();
    const updated = unsetByPath(config, path);
    saveConfig(updated);
    console.log(`Removed ${path}`);
    return;
  }

  // lil config path
  if (sub === "path") {
    console.log(getConfigPath());
    return;
  }

  console.error(`Unknown config subcommand "${sub}".\n\nUsage: lil config show | get <path> | set <path> <value> | unset <path>`);
  process.exit(1);
}

// ─── Persona management ───────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const PERSONA_DIR = join(getLilDir(), "persona");

const PERSONA_STARTERS: Record<string, string> = {
  "identity.md": `# Identity

You are **lil**, a personal AI assistant.

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

<!-- Add facts about yourself here so lil knows your context -->
- Name: (your name)
- Stack: (your tech stack)
- Current project: (what you're working on)
`,
};

async function cmdPersona(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  // lil persona (or lil persona show) — show loaded files
  if (!sub || sub === "show") {
    if (!existsSync(PERSONA_DIR)) {
      console.log(`No persona directory found at ${PERSONA_DIR}\n`);
      console.log("Run 'lil persona init' to create starter persona files.");
      return;
    }

    const files = readdirSync(PERSONA_DIR).filter((f) => f.endsWith(".md"));
    if (files.length === 0) {
      console.log(`Persona directory exists but contains no .md files.\n`);
      console.log("Run 'lil persona init' to create starter files.");
      return;
    }

    console.log(`Persona files (${PERSONA_DIR}):\n`);
    for (const file of files) {
      const filePath = join(PERSONA_DIR, file);
      const content = readFileSync(filePath, "utf-8").trim();
      const lines = content.split("\n");
      const preview = lines.slice(0, 3).join(" ").slice(0, 80);
      console.log(`  📄 ${file}`);
      console.log(`     ${preview}${content.length > 80 ? "..." : ""}\n`);
    }
    return;
  }

  // lil persona init — create starter files
  if (sub === "init") {
    if (!existsSync(PERSONA_DIR)) {
      mkdirSync(PERSONA_DIR, { recursive: true, mode: 0o700 });
    }

    let created = 0;
    let skipped = 0;
    for (const [filename, content] of Object.entries(PERSONA_STARTERS)) {
      const filePath = join(PERSONA_DIR, filename);
      if (existsSync(filePath)) {
        console.log(`  ⏭  ${filename} (already exists, skipping)`);
        skipped++;
      } else {
        writeFileSync(filePath, content, "utf-8");
        console.log(`  ✓  ${filename}`);
        created++;
      }
    }

    console.log(`\n${created} file(s) created, ${skipped} skipped.`);
    console.log(`\nEdit your persona files in: ${PERSONA_DIR}/`);
    console.log("Changes take effect on the next session start.\n");
    return;
  }

  // lil persona edit [file] — open in $EDITOR
  if (sub === "edit") {
    const editor = process.env.EDITOR || process.env.VISUAL || "nano";
    const file = rest[0];

    if (file) {
      const filePath = join(PERSONA_DIR, file.endsWith(".md") ? file : `${file}.md`);
      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        console.log(`\nAvailable files: ${readdirSync(PERSONA_DIR).filter((f) => f.endsWith(".md")).join(", ") || "(none)"}`);
        process.exit(1);
      }
      execSync(`${editor} "${filePath}"`, { stdio: "inherit" });
    } else {
      // Open the directory or all files
      if (!existsSync(PERSONA_DIR)) {
        console.error(`Persona directory doesn't exist. Run 'lil persona init' first.`);
        process.exit(1);
      }
      execSync(`${editor} "${PERSONA_DIR}"`, { stdio: "inherit" });
    }
    return;
  }

  // lil persona path — show the path
  if (sub === "path") {
    console.log(PERSONA_DIR);
    return;
  }

  console.error(`Unknown persona subcommand "${sub}".\n\nUsage: lil persona [show | init | edit [file] | path]`);
  process.exit(1);
}

// ─── Memory management ────────────────────────────────────────────────────────

import { MemoryDB } from "./extensions/persona/memory-db.ts";

const MEMORY_DB_PATH = join(getLilDir(), "memory.db");

async function cmdMemory(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const db = new MemoryDB(MEMORY_DB_PATH);

  try {
    // lil memory (or lil memory stats) — show statistics
    if (!sub || sub === "stats") {
      const stats = db.stats();
      console.log(`Memory database: ${MEMORY_DB_PATH}\n`);
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

    // lil memory search <query>
    if (sub === "search") {
      const query = rest.join(" ").trim();
      if (!query) {
        console.error("Usage: lil memory search <query>");
        process.exit(1);
      }
      const results = db.recall(query, 10);
      if (results.length === 0) {
        console.log(`No memories found matching: "${query}"`);
        return;
      }
      console.log(`Found ${results.length} result(s):\n`);
      for (const entry of results) {
        console.log(`  [${entry.category}] ${entry.key}`);
        console.log(`    ${entry.content}`);
        console.log(`    updated: ${entry.updatedAt}\n`);
      }
      return;
    }

    // lil memory list [category]
    if (sub === "list") {
      const category = rest[0];
      const entries = db.list(category, 50);
      if (entries.length === 0) {
        console.log(category ? `No memories in category "${category}".` : "No memories stored.");
        return;
      }
      console.log(`Memories${category ? ` (${category})` : ""}: ${entries.length}\n`);
      for (const entry of entries) {
        console.log(`  [${entry.category}] ${entry.key}: ${entry.content.slice(0, 80)}${entry.content.length > 80 ? "..." : ""}`);
      }
      console.log();
      return;
    }

    // lil memory export
    if (sub === "export") {
      const core = db.exportCore();
      const json = JSON.stringify(
        core.map((e) => ({ key: e.key, content: e.content, category: e.category })),
        null,
        2
      );
      console.log(json);
      return;
    }

    // lil memory forget <key>
    if (sub === "forget") {
      const key = rest[0];
      if (!key) {
        console.error("Usage: lil memory forget <key>");
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

    console.error(`Unknown memory subcommand "${sub}".\n\nUsage: lil memory [stats | search <query> | list [category] | export | forget <key>]`);
    process.exit(1);
  } finally {
    db.close();
  }
}

// ─── Cron management ──────────────────────────────────────────────────────────

import { loadJobs, saveJobs } from "./extensions/cron/index.ts";

async function cmdCron(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  // lil cron list
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

  // lil cron remove <id>
  if (sub === "remove") {
    const id = rest[0];
    if (!id) {
      console.error("Usage: lil cron remove <id>");
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

  // lil cron clear — remove all completed jobs
  if (sub === "clear") {
    const jobs = loadJobs();
    const before = jobs.length;
    const active = jobs.filter((j) => !j.completed);
    saveJobs(active);
    console.log(`Cleared ${before - active.length} completed job(s).`);
    return;
  }

  console.error(`Unknown cron subcommand "${sub}".\n\nUsage: lil cron [list | remove <id> | clear]`);
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

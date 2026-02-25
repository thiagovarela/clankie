/**
 * clankie daemon — always-on process that connects channels to the agent.
 *
 * Receives messages from channels (Telegram, etc.), routes them to
 * a pi agent session, collects the response, and sends it back.
 *
 * Each chat gets its own persistent session (keyed by channel+chatId).
 */

import { existsSync, readFileSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";
import {
	type AgentSession,
	AuthStorage,
	type CreateAgentSessionResult,
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { Attachment, Channel, InboundMessage } from "./channels/channel.ts";
import { SlackChannel } from "./channels/slack.ts";
import {
	type AppConfig,
	getAgentDir,
	getAppDir,
	getAuthPath,
	getConfigPath,
	getPersonaDir,
	getWorkspace,
	loadChannelPersonaOverrides,
	loadConfig,
	resolvePersonaModel,
	saveChannelPersonaOverrides,
} from "./config.ts";
import cronExtension from "./extensions/cron/index.ts";
import { createPersonaExtension } from "./extensions/persona/index.ts";
import securityExtension from "./extensions/security.ts";
import { HeartbeatService } from "./heartbeat.ts";

// ─── PID file management ──────────────────────────────────────────────────────

const PID_FILE = join(getAppDir(), "daemon.pid");

export function isRunning(): { running: boolean; pid?: number } {
	if (!existsSync(PID_FILE)) return { running: false };

	try {
		const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
		// Check if process is alive
		process.kill(pid, 0);
		return { running: true, pid };
	} catch {
		// Process not found — stale PID file
		cleanupPidFile();
		return { running: false };
	}
}

function writePidFile(): void {
	writeFileSync(PID_FILE, String(process.pid), "utf-8");
}

function cleanupPidFile(): void {
	try {
		unlinkSync(PID_FILE);
	} catch {
		// ignore
	}
}

// ─── Session cache (one session per chat) ──────────────────────────────────────

const sessionCache = new Map<string, AgentSession>();

// Track active session name per chat (for /switch command)
const activeSessionNames = new Map<string, string>();

// Track channel-specific persona overrides (runtime, persisted to ~/.clankie/channel-personas.json)
const channelPersonaOverrides = new Map<string, string>();

// ─── Daemon state tracking (for config reload) ────────────────────────────────

let activeChannels: Channel[] = [];
let activeHeartbeat: HeartbeatService | null = null;
let configWatcher: ReturnType<typeof watch> | null = null;
let lastActiveChannel: Channel | null = null;
let lastActiveChatId: string | null = null;
let lastActiveThreadId: string | null = null;

/**
 * Resolve the persona name for a given channel and chat ID.
 * Resolution order:
 * 1. Runtime override (channelPersonaOverrides)
 * 2. Config per-channel mapping (channels.slack.channelPersonas[chatId])
 * 3. Config channel-level default (channels.slack.persona)
 * 4. Config global default (agent.persona)
 * 5. Hardcoded fallback ("default")
 */
function resolveChannelPersona(channel: string, chatId: string, config: AppConfig): string {
	const channelKey = `${channel}_${chatId}`;

	// 1. Runtime override
	const override = channelPersonaOverrides.get(channelKey);
	if (override) return override;

	// 2. Config per-channel mapping (Slack only for now)
	if (channel === "slack") {
		const slackConfig = config.channels?.slack;
		const channelMapping = slackConfig?.channelPersonas?.[chatId];
		if (channelMapping) return channelMapping;

		// 3. Config channel-level default
		if (slackConfig?.persona) return slackConfig.persona;
	}

	// 4. Config global default
	if (config.agent?.persona) return config.agent.persona;

	// 5. Hardcoded fallback
	return "default";
}

async function getOrCreateSession(
	chatKey: string,
	config: AppConfig,
	personaName: string = "default",
): Promise<AgentSession> {
	const cached = sessionCache.get(chatKey);
	if (cached) return cached;

	// Validate persona name early
	try {
		getPersonaDir(personaName);
	} catch (err) {
		console.error(
			`[daemon] Invalid persona name "${personaName}": ${err instanceof Error ? err.message : String(err)}`,
		);
		throw err;
	}

	const agentDir = getAgentDir(config);
	const cwd = getWorkspace(config);

	const authStorage = AuthStorage.create(getAuthPath());
	const modelRegistry = new ModelRegistry(authStorage);

	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		extensionFactories: [securityExtension, createPersonaExtension(personaName), cronExtension],
	});
	await loader.reload();

	// Use a stable session directory per chat so conversations persist across restarts
	const sessionDir = join(getAppDir(), "sessions", chatKey);

	const sessionManager = SessionManager.continueRecent(cwd, sessionDir);

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
				console.warn(`[daemon] Warning: model "${modelSpec}" from ${source} not found, falling back to auto-detection`);
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
	});

	const { session } = result;

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
			console.error(`[daemon] Extension error (${err.extensionPath}): ${err.error}`);
		},
	});

	// Subscribe to enable session persistence
	session.subscribe(() => {});

	sessionCache.set(chatKey, session);
	return session;
}

// ─── Session helpers ───────────────────────────────────────────────────────────

/**
 * List all session names for a given chat identifier.
 * Scans ~/.clankie/sessions/ for directories matching the chatIdentifier prefix.
 */
function listSessionNames(chatIdentifier: string): string[] {
	const sessionsDir = join(getAppDir(), "sessions");
	if (!existsSync(sessionsDir)) {
		return [];
	}

	try {
		const { readdirSync, statSync } = require("node:fs");
		const entries = readdirSync(sessionsDir);
		const sessionNames = new Set<string>();

		for (const entry of entries) {
			// Session directories are named: {channel}_{chatId}_{personaName}_{sessionName}
			// We want to extract unique sessionNames for this chatIdentifier
			if (entry.startsWith(`${chatIdentifier}_`)) {
				const entryPath = join(sessionsDir, entry);
				if (statSync(entryPath).isDirectory()) {
					// Extract session name from: chatIdentifier_personaName_sessionName
					const parts = entry.substring(chatIdentifier.length + 1).split("_");
					// parts[0] is personaName, rest is sessionName
					if (parts.length >= 2) {
						const sessionName = parts.slice(1).join("_");
						sessionNames.add(sessionName);
					}
				}
			}
		}

		return Array.from(sessionNames).sort();
	} catch (err) {
		console.error(`[daemon] Error listing session names: ${err instanceof Error ? err.message : String(err)}`);
		return [];
	}
}

// ─── Attachment helpers ────────────────────────────────────────────────────────

const IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Convert image attachments to pi's ImageContent format for vision models. */
function toImageContents(attachments?: Attachment[]): ImageContent[] {
	if (!attachments) return [];
	return attachments
		.filter((a) => IMAGE_MIME_PREFIXES.some((prefix) => a.mimeType.startsWith(prefix)))
		.map((a) => ({ type: "image" as const, data: a.data, mimeType: a.mimeType }));
}

/** Save non-image attachments to disk and return their paths. */
async function saveNonImageAttachments(
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
		console.log(`[daemon] Saved attachment: ${filePath} (${att.mimeType})`);
	}
	return results;
}

// ─── Message handling ──────────────────────────────────────────────────────────

/** Lock to serialize message processing per chat */
const chatLocks = new Map<string, Promise<void>>();

async function handleMessage(message: InboundMessage, channel: Channel): Promise<void> {
	const config = loadConfig();

	// Determine session name:
	// 1. For forum topics (threadId present) → use threadId
	// 2. For regular chats → use active session name or "default"
	const chatIdentifier = `${message.channel}_${message.chatId}`;

	let sessionName: string;
	if (message.threadId) {
		// Forum topic — use threadId as session name
		sessionName = message.threadId;
	} else {
		// Regular chat — use active session name
		sessionName = activeSessionNames.get(chatIdentifier) ?? "default";
	}

	// Resolve persona for this channel
	const personaName = resolveChannelPersona(message.channel, message.chatId, config);

	// Include persona in chatKey so each persona gets its own session
	const chatKey = `${chatIdentifier}_${personaName}_${sessionName}`;

	// Serialize messages per chat — wait for previous message to finish
	const previous = chatLocks.get(chatKey) ?? Promise.resolve();
	const current = previous.then(() =>
		processMessage(message, channel, chatKey, chatIdentifier, sessionName, personaName),
	);
	chatLocks.set(
		chatKey,
		current.catch(() => {}),
	); // swallow errors in the chain
	await current;
}

async function processMessage(
	message: InboundMessage,
	channel: Channel,
	chatKey: string,
	chatIdentifier: string,
	sessionName: string,
	personaName: string,
): Promise<void> {
	const config = loadConfig();

	const attachCount = message.attachments?.length ?? 0;
	const preview = message.text.slice(0, 100) || (attachCount > 0 ? `[${attachCount} attachment(s)]` : "[empty]");
	const sessionInfo = sessionName !== "default" ? ` [session:${sessionName}]` : "";
	const personaInfo = personaName !== "default" ? ` [persona:${personaName}]` : "";
	console.log(
		`[daemon] ${message.channel}/${message.chatId}${sessionInfo}${personaInfo} (${message.senderName}): ${preview}`,
	);

	// Prepare send options for thread-aware responses
	// Always reply in a thread: use existing thread or create new one with message.id as parent
	const sendOptions = { threadId: message.threadId || message.id };

	try {
		const trimmed = message.text.trim();

		// Handle /switch <name> command — switch to a different session
		if (trimmed.startsWith("/switch ")) {
			const newSessionName = trimmed.substring(8).trim();
			if (!newSessionName || newSessionName.includes(" ")) {
				await channel.send(message.chatId, "⚠️ Usage: /switch <session-name>\n\nExample: /switch coding", sendOptions);
				return;
			}

			activeSessionNames.set(chatIdentifier, newSessionName);
			console.log(`[daemon] Switched ${chatIdentifier} to session "${newSessionName}"`);
			await channel.send(
				message.chatId,
				`💬 Switched to session "${newSessionName}"\n\nUse /sessions to see all sessions.`,
				sendOptions,
			);
			return;
		}

		// Handle /sessions command — list all sessions for this chat
		if (trimmed === "/sessions") {
			const chatSessions = listSessionNames(chatIdentifier);

			if (chatSessions.length === 0) {
				await channel.send(
					message.chatId,
					"No sessions found yet. Send a message to create the first one!",
					sendOptions,
				);
				return;
			}

			const currentSession = activeSessionNames.get(chatIdentifier) ?? "default";
			const sessionList = chatSessions
				.map((name) => (name === currentSession ? `• ${name} ✓ (active)` : `• ${name}`))
				.join("\n");

			await channel.send(
				message.chatId,
				`📋 Available sessions:\n\n${sessionList}\n\nSwitch with: /switch <name>`,
				sendOptions,
			);
			return;
		}

		// Handle /new command — reset current session
		if (trimmed === "/new") {
			const session = await getOrCreateSession(chatKey, config, personaName);
			await session.newSession();
			console.log(`[daemon] Session reset for ${chatKey}`);
			await channel.send(
				message.chatId,
				`✨ Started a fresh session in "${sessionName}". Previous context cleared.`,
				sendOptions,
			);
			return;
		}

		// Handle /persona command — show/switch/reset persona
		if (trimmed === "/persona" || trimmed.startsWith("/persona ")) {
			const args = trimmed.substring(8).trim();

			// /persona (no args) — show current persona
			if (!args) {
				const channelKey = `${message.channel}_${message.chatId}`;
				const runtimeOverride = channelPersonaOverrides.get(channelKey);
				const configChannelPersona =
					message.channel === "slack" ? config.channels?.slack?.channelPersonas?.[message.chatId] : undefined;
				const configDefault = config.channels?.slack?.persona ?? config.agent?.persona ?? "default";

				const lines = [`**Current persona:** ${personaName}`];
				if (runtimeOverride) {
					lines.push(`  (Runtime override — use \`/persona reset\` to clear)`);
				} else if (configChannelPersona) {
					lines.push(`  (From config: \`channels.slack.channelPersonas["${message.chatId}"]\`)`);
				} else {
					lines.push(`  (Config default: ${configDefault})`);
				}

				lines.push("");
				lines.push("**Commands:**");
				lines.push("  `/persona <name>` — switch to a different persona");
				lines.push("  `/persona reset` — reset to the configured default");
				lines.push("");
				lines.push("Use `clankie persona` to list available personas.");

				await channel.send(message.chatId, lines.join("\n"), sendOptions);
				return;
			}

			// /persona reset — remove runtime override
			if (args === "reset") {
				const channelKey = `${message.channel}_${message.chatId}`;
				const hadOverride = channelPersonaOverrides.has(channelKey);

				if (hadOverride) {
					channelPersonaOverrides.delete(channelKey);
					// Persist to disk
					const overrides: Record<string, string> = {};
					for (const [k, v] of channelPersonaOverrides.entries()) {
						overrides[k] = v;
					}
					saveChannelPersonaOverrides(overrides);

					const newPersona = resolveChannelPersona(message.channel, message.chatId, config);
					await channel.send(
						message.chatId,
						`✅ Reset persona to **${newPersona}** (from config).\n\nNext message will use this persona.`,
						sendOptions,
					);
				} else {
					await channel.send(
						message.chatId,
						"ℹ️ No runtime override is set. Already using the configured default.",
						sendOptions,
					);
				}
				return;
			}

			// /persona <name> — switch to a different persona
			const newPersonaName = args;

			// Validate persona exists
			try {
				getPersonaDir(newPersonaName);
			} catch (err) {
				await channel.send(
					message.chatId,
					`⚠️ Invalid persona name: ${err instanceof Error ? err.message : String(err)}\n\nUse \`clankie persona\` to list available personas.`,
					sendOptions,
				);
				return;
			}

			// Update runtime override
			const channelKey = `${message.channel}_${message.chatId}`;
			channelPersonaOverrides.set(channelKey, newPersonaName);

			// Persist to disk
			const overrides: Record<string, string> = {};
			for (const [k, v] of channelPersonaOverrides.entries()) {
				overrides[k] = v;
			}
			saveChannelPersonaOverrides(overrides);

			console.log(`[daemon] Switched ${channelKey} to persona "${newPersonaName}"`);
			await channel.send(
				message.chatId,
				`✅ Switched to persona **${newPersonaName}**.\n\nNext message will use this persona.\nUse \`/persona reset\` to revert to the default.`,
				sendOptions,
			);
			return;
		}

		const session = await getOrCreateSession(chatKey, config, personaName);

		// Build image attachments for the agent (vision-capable models)
		const images = toImageContents(message.attachments);

		// For non-image attachments, save to temp files and note paths in the prompt
		const filePaths = await saveNonImageAttachments(message.attachments, chatKey);

		let promptText = message.text;
		if (filePaths.length > 0) {
			const fileList = filePaths.map((f) => `  - ${f.fileName}: ${f.path}`).join("\n");
			const prefix = promptText ? `${promptText}\n\n` : "";
			promptText = `${prefix}[Attached files saved to disk]\n${fileList}`;
		}

		if (!promptText && images.length === 0) {
			// Nothing to send — likely an unsupported attachment type that failed download
			await channel.send(message.chatId, "⚠️ Received an empty message with no processable content.", sendOptions);
			return;
		}

		// Send message to agent and wait for completion
		await session.prompt(promptText || "Describe this image.", {
			source: "rpc",
			images: images.length > 0 ? images : undefined,
		});

		// Extract the assistant's response
		const state = session.state;
		const lastMessage = state.messages[state.messages.length - 1];

		if (lastMessage?.role === "assistant") {
			const textParts: string[] = [];
			for (const content of lastMessage.content) {
				if (content.type === "text" && content.text.trim()) {
					textParts.push(content.text);
				}
			}

			const responseText = textParts.join("\n").trim();
			if (responseText) {
				await channel.send(message.chatId, responseText, sendOptions);
			} else {
				await channel.send(message.chatId, "(No text response)", sendOptions);
			}
		}
	} catch (err) {
		console.error(`[daemon] Error processing message:`, err);
		try {
			await channel.send(message.chatId, `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`, sendOptions);
		} catch {
			// Failed to send error — ignore
		}
	}
}

// ─── Daemon lifecycle ──────────────────────────────────────────────────────────

/**
 * Initialize channels and heartbeat from current config.
 * Stores references in module-level state for restart capability.
 */
async function initializeChannelsAndHeartbeat(): Promise<void> {
	const config = loadConfig();

	// Load channel persona overrides from disk
	const overrides = loadChannelPersonaOverrides();
	channelPersonaOverrides.clear();
	for (const [key, value] of Object.entries(overrides)) {
		channelPersonaOverrides.set(key, value);
	}
	if (channelPersonaOverrides.size > 0) {
		console.log(`[daemon] Loaded ${channelPersonaOverrides.size} channel persona override(s)`);
	}

	const channels: Channel[] = [];

	// Slack
	const slack = config.channels?.slack;
	if (slack?.appToken && slack.botToken && slack.enabled !== false) {
		channels.push(
			new SlackChannel({
				appToken: slack.appToken,
				botToken: slack.botToken,
				allowedUsers: slack.allowFrom ?? [],
				allowedChannelIds: slack.allowedChannelIds,
			}),
		);
	}

	if (channels.length === 0) {
		console.error(
			"No channels configured. Set up Slack:\n\n" +
				"  clankie config set channels.slack.appToken <xapp-...>\n" +
				"  clankie config set channels.slack.botToken <xoxb-...>\n" +
				'  clankie config set channels.slack.allowFrom ["U12345678"]\n' +
				"\nOr edit ~/.clankie/clankie.json directly.\n",
		);
		process.exit(1);
	}

	// ─── Heartbeat service ──────────────────────────────────────────────

	const heartbeat = new HeartbeatService(config);

	heartbeat.setHandler(async (prompt: string) => {
		// Use last active channel to deliver heartbeat results
		if (!lastActiveChannel || !lastActiveChatId) {
			console.log("[heartbeat] No active channel — skipping delivery");
			return;
		}

		const chatKey = `heartbeat_${lastActiveChatId}${lastActiveThreadId ? `_${lastActiveThreadId}` : "_default"}`;
		const personaName = config.agent?.persona ?? "default";
		const session = await getOrCreateSession(chatKey, config, personaName);

		try {
			await session.prompt(prompt, { source: "rpc" });

			const state = session.state;
			const lastMessage = state.messages[state.messages.length - 1];

			if (lastMessage?.role === "assistant") {
				const textParts: string[] = [];
				for (const content of lastMessage.content) {
					if (content.type === "text" && content.text.trim()) {
						textParts.push(content.text);
					}
				}

				const responseText = textParts.join("\n").trim();
				// Don't send "all clear" messages — only actionable results
				if (responseText && !responseText.match(/^all\s+clear\.?$/i)) {
					const sendOptions = lastActiveThreadId ? { threadId: lastActiveThreadId } : undefined;
					await lastActiveChannel.send(lastActiveChatId, `🔔 ${responseText}`, sendOptions);
				}
			}
		} catch (err) {
			console.error(`[heartbeat] Error processing:`, err instanceof Error ? err.message : String(err));
		}
	});

	// ─── Start channels ──────────────────────────────────────────────────

	console.log(`[daemon] Workspace: ${getWorkspace(config)}`);
	console.log(`[daemon] Channels: ${channels.length > 0 ? channels.map((c) => c.name).join(", ") : "(none)"}`);

	for (const ch of channels) {
		await ch.start((msg) => {
			// Track last active channel for heartbeat delivery
			lastActiveChannel = ch;
			lastActiveChatId = msg.chatId;
			lastActiveThreadId = msg.threadId ?? null;
			return handleMessage(msg, ch);
		});
	}

	// Start heartbeat after channels are ready
	heartbeat.start();

	// Store in module state
	activeChannels = channels;
	activeHeartbeat = heartbeat;

	console.log("[daemon] Ready. Waiting for messages...");
}

/**
 * Restart the daemon by stopping all channels, clearing cache, and reinitializing.
 */
async function restartDaemon(): Promise<void> {
	console.log("[daemon] Config changed — restarting...");

	// Stop existing channels and heartbeat
	if (activeHeartbeat) {
		activeHeartbeat.stop();
		activeHeartbeat = null;
	}

	for (const ch of activeChannels) {
		await ch.stop().catch((err) => {
			console.error(`[daemon] Error stopping channel ${ch.name}:`, err);
		});
	}
	activeChannels = [];

	// Clear session cache (sessions are persisted to disk, so no data loss)
	sessionCache.clear();

	// Reinitialize with fresh config
	await initializeChannelsAndHeartbeat();

	console.log("[daemon] Restart complete.");
}

export async function startDaemon(): Promise<void> {
	// Write PID file
	writePidFile();

	console.log(`[daemon] Starting clankie daemon (pid ${process.pid})...`);

	// Initial startup
	await initializeChannelsAndHeartbeat();

	// ─── Config file watcher ──────────────────────────────────────────────

	const configPath = getConfigPath();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	try {
		configWatcher = watch(configPath, (_eventType) => {
			// Debounce: config writes often trigger multiple events (write + chmod)
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				restartDaemon().catch((err) => {
					console.error("[daemon] Restart failed:", err instanceof Error ? err.message : String(err));
				});
			}, 1000);
		});
		console.log(`[daemon] Watching config file: ${configPath}`);
	} catch (err) {
		console.warn(`[daemon] Could not watch config file: ${err instanceof Error ? err.message : String(err)}`);
	}

	// ─── Graceful shutdown ────────────────────────────────────────────────

	const shutdown = async (signal: string) => {
		console.log(`\n[daemon] Received ${signal}, shutting down...`);

		// Close config watcher
		if (configWatcher) {
			configWatcher.close();
			configWatcher = null;
		}

		// Stop heartbeat and channels
		if (activeHeartbeat) {
			activeHeartbeat.stop();
		}
		for (const ch of activeChannels) {
			await ch.stop().catch(() => {});
		}

		cleanupPidFile();
		process.exit(0);
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export function stopDaemon(): boolean {
	const status = isRunning();
	if (!status.running || !status.pid) {
		console.log("Daemon is not running.");
		return false;
	}

	try {
		process.kill(status.pid, "SIGTERM");
		console.log(`Stopped daemon (pid ${status.pid}).`);
		cleanupPidFile();
		return true;
	} catch (err) {
		console.error(`Failed to stop daemon: ${err instanceof Error ? err.message : String(err)}`);
		return false;
	}
}

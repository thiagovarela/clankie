/**
 * lil daemon — always-on process that connects channels to the agent.
 *
 * Receives messages from channels (Telegram, etc.), routes them to
 * a pi agent session, collects the response, and sends it back.
 *
 * Each chat gets its own persistent session (keyed by channel+chatId).
 */

import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
import { TelegramChannel } from "./channels/telegram.ts";
import {
	ensureWebToken,
	getAgentDir,
	getAuthPath,
	getLilDir,
	getPersonaDir,
	getWorkspace,
	type LilConfig,
	loadConfig,
	resolvePersonaModel,
} from "./config.ts";
import cronExtension from "./extensions/cron/index.ts";
import { createPersonaExtension } from "./extensions/persona/index.ts";
import securityExtension from "./extensions/security.ts";
import { HeartbeatService } from "./heartbeat.ts";

// ─── PID file management ──────────────────────────────────────────────────────

const PID_FILE = join(getLilDir(), "daemon.pid");

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

export function listSessionNames(chatIdentifier: string): string[] {
	const sessionDir = join(getLilDir(), "sessions");
	if (!existsSync(sessionDir)) return [];

	const prefix = `${chatIdentifier}_`;
	return readdirSync(sessionDir)
		.filter((dir) => dir.startsWith(prefix))
		.map((dir) => dir.substring(prefix.length))
		.sort((a, b) => a.localeCompare(b));
}

export function resetSession(chatKey: string): void {
	sessionCache.delete(chatKey);
}

async function getOrCreateSession(
	chatKey: string,
	config: LilConfig,
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
	const sessionDir = join(getLilDir(), "sessions", chatKey);

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

export async function getSessionByKey(chatKey: string, config: LilConfig, personaName?: string): Promise<AgentSession> {
	return getOrCreateSession(chatKey, config, personaName ?? "default");
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

	const dir = join(getLilDir(), "attachments", chatKey);
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

	const chatKey = `${chatIdentifier}_${sessionName}`;

	// Serialize messages per chat — wait for previous message to finish
	const previous = chatLocks.get(chatKey) ?? Promise.resolve();
	const current = previous.then(() => processMessage(message, channel, chatKey, chatIdentifier, sessionName));
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
): Promise<void> {
	const config = loadConfig();

	// Resolve persona: channel config → global config → "default"
	let personaName = config.agent?.persona ?? "default";
	if (message.channel === "telegram" && config.channels?.telegram?.persona) {
		personaName = config.channels.telegram.persona;
	}
	// Future: add web, whatsapp, etc.

	const attachCount = message.attachments?.length ?? 0;
	const preview = message.text.slice(0, 100) || (attachCount > 0 ? `[${attachCount} attachment(s)]` : "[empty]");
	const sessionInfo = sessionName !== "default" ? ` [session:${sessionName}]` : "";
	console.log(`[daemon] ${message.channel}/${message.chatId}${sessionInfo} (${message.senderName}): ${preview}`);

	// Prepare send options for thread-aware responses
	const sendOptions = message.threadId ? { threadId: message.threadId } : undefined;

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

export async function startDaemon(): Promise<void> {
	let config = loadConfig();
	const channels: Channel[] = [];
	const webEnabled = config.web?.enabled !== false;

	// Ensure web token exists when web UI is enabled
	if (webEnabled && !config.web?.token) {
		ensureWebToken(config);
		config = loadConfig();
	}

	// Telegram
	const tg = config.channels?.telegram;
	if (tg?.botToken && tg.enabled !== false) {
		channels.push(
			new TelegramChannel({
				token: tg.botToken,
				allowedUsers: tg.allowFrom ?? [],
			}),
		);
	}

	if (channels.length === 0 && !webEnabled) {
		console.error(
			"No channels configured and web UI disabled. Set up one of the following:\n\n" +
				"  lil config set channels.telegram.botToken <your-bot-token>\n" +
				"  lil config set channels.telegram.allowFrom [your-telegram-user-id]\n" +
				"  lil config set web.enabled true\n" +
				"\nOr edit ~/.lil/lil.json directly.\n",
		);
		process.exit(1);
	}

	// Write PID file
	writePidFile();

	// Optional web server
	let webHandle: { stop: () => void } | undefined;
	if (webEnabled) {
		const { startWebServer } = await import("./web/server.ts");
		webHandle = await startWebServer(config, {
			getSession: getSessionByKey,
			resetSession,
			listSessionNames,
		});
	}

	// ─── Heartbeat service ──────────────────────────────────────────────

	const heartbeat = new HeartbeatService(config);

	// Track last active channel for heartbeat responses
	let lastChannel: Channel | null = null;
	let lastChatId: string | null = null;
	let lastThreadId: string | null = null;

	heartbeat.setHandler(async (prompt: string) => {
		// Use last active channel to deliver heartbeat results
		if (!lastChannel || !lastChatId) {
			console.log("[heartbeat] No active channel — skipping delivery");
			return;
		}

		const chatKey = `heartbeat_${lastChatId}${lastThreadId ? `_${lastThreadId}` : "_default"}`;
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
					const sendOptions = lastThreadId ? { threadId: lastThreadId } : undefined;
					await lastChannel.send(lastChatId, `🔔 ${responseText}`, sendOptions);
				}
			}
		} catch (err) {
			console.error(`[heartbeat] Error processing:`, err instanceof Error ? err.message : String(err));
		}
	});

	// ─── Graceful shutdown ────────────────────────────────────────────────

	const shutdown = async (signal: string) => {
		console.log(`\n[daemon] Received ${signal}, shutting down...`);
		heartbeat.stop();
		webHandle?.stop();
		for (const ch of channels) {
			await ch.stop().catch(() => {});
		}
		cleanupPidFile();
		process.exit(0);
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	// ─── Start channels ──────────────────────────────────────────────────

	console.log(`[daemon] Starting lil daemon (pid ${process.pid})...`);
	console.log(`[daemon] Workspace: ${getWorkspace(config)}`);
	console.log(`[daemon] Channels: ${channels.length > 0 ? channels.map((c) => c.name).join(", ") : "(none)"}`);
	console.log(`[daemon] Web UI: ${webEnabled ? "enabled" : "disabled"}`);

	for (const ch of channels) {
		await ch.start((msg) => {
			// Track last active channel for heartbeat delivery
			lastChannel = ch;
			lastChatId = msg.chatId;
			lastThreadId = msg.threadId ?? null;
			return handleMessage(msg, ch);
		});
	}

	// Start heartbeat after channels are ready
	heartbeat.start();

	console.log("[daemon] Ready. Waiting for messages...");
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

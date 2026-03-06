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
import type { Channel, InboundMessage } from "./channels/channel.ts";
import { WebChannel } from "./channels/web.ts";
import { getAppDir, getBundledWebUiDir, getConfigPath, getWorkspace, loadConfig } from "./config.ts";
import { CronScheduler, getCronJobsPath, setCronScheduler } from "./extensions/cron/index.ts";
import { initNotifications } from "./notifications.ts";
import {
	getActiveSessionName,
	getOrCreateSession,
	listSessionNames,
	logStartupLoadedResources,
	saveNonImageAttachments,
	setActiveSessionName,
	toImageContents,
	withChatLock,
} from "./sessions.ts";

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

// ─── Daemon state tracking (for config reload) ────────────────────────────────

let activeChannels: Channel[] = [];
let configWatcher: ReturnType<typeof watch> | null = null;
let cronJobsWatcher: ReturnType<typeof watch> | null = null;
let cronScheduler: CronScheduler | null = null;

// ─── Message handling ──────────────────────────────────────────────────────────

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
		sessionName = getActiveSessionName(chatIdentifier);
	}

	const chatKey = `${chatIdentifier}_${sessionName}`;

	// Serialize messages per chat — wait for previous message to finish
	await withChatLock(chatKey, () => processMessage(message, channel, chatKey, chatIdentifier, sessionName));
}

async function processMessage(
	message: InboundMessage,
	channel: Channel,
	chatKey: string,
	chatIdentifier: string,
	sessionName: string,
): Promise<void> {
	const config = loadConfig();

	const attachCount = message.attachments?.length ?? 0;
	const preview = message.text.slice(0, 100) || (attachCount > 0 ? `[${attachCount} attachment(s)]` : "[empty]");
	const sessionInfo = sessionName !== "default" ? ` [session:${sessionName}]` : "";
	console.log(`[daemon] ${message.channel}/${message.chatId}${sessionInfo} (${message.senderName}): ${preview}`);

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

			setActiveSessionName(chatIdentifier, newSessionName);
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

			const currentSession = getActiveSessionName(chatIdentifier);
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
			const session = await getOrCreateSession(chatKey, config);
			await session.newSession();
			console.log(`[daemon] Session reset for ${chatKey}`);
			await channel.send(
				message.chatId,
				`✨ Started a fresh session in "${sessionName}". Previous context cleared.`,
				sendOptions,
			);
			return;
		}

		const session = await getOrCreateSession(chatKey, config);

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
 * Initialize channels from current config.
 * Stores references in module-level state for restart capability.
 */
async function initializeChannels(): Promise<void> {
	const config = loadConfig();

	try {
		await logStartupLoadedResources(config);
	} catch (err) {
		console.warn(`[daemon] Failed to list startup resources: ${err instanceof Error ? err.message : String(err)}`);
	}

	const channels: Channel[] = [];

	// Web
	const web = config.channels?.web;
	if (web?.authToken && web.enabled !== false) {
		// Resolve static dir: explicit config > bundled web-ui > none
		const staticDir = web.staticDir ?? getBundledWebUiDir();
		if (staticDir) {
			console.log(`[daemon] Serving web-ui from: ${staticDir}`);
		}

		channels.push(
			new WebChannel({
				port: web.port ?? 3100,
				authToken: web.authToken,
				allowedOrigins: web.allowedOrigins,
				staticDir,
			}),
		);
	}

	if (channels.length === 0) {
		console.error(
			"No channels configured. Set up Web:\n\n" +
				'  clankie config set channels.web.authToken "your-secret-token"\n' +
				"  clankie config set channels.web.port 3100\n" +
				"\nOr edit ~/.clankie/clankie.json directly.\n",
		);
		process.exit(1);
	}

	console.log(`[daemon] Workspace: ${getWorkspace(config)}`);
	console.log(`[daemon] Channels: ${channels.length > 0 ? channels.map((c) => c.name).join(", ") : "(none)"}`);

	for (const ch of channels) {
		await ch.start((msg) => handleMessage(msg, ch));
	}

	// Store in module state
	activeChannels = channels;

	// Cron scheduler
	if (cronScheduler) {
		cronScheduler.stop();
		cronScheduler = null;
		setCronScheduler(null);
	}
	if (config.cron?.enabled !== false) {
		cronScheduler = new CronScheduler({
			tickIntervalMs: config.cron?.tickIntervalMs,
			onDeliver: async (delivery, text) => {
				const target = channels.find((channel) => channel.name === delivery.channel);
				if (!target) {
					throw new Error(`Delivery channel not available: ${delivery.channel}`);
				}
				await target.send(delivery.chatId, text, { threadId: delivery.threadId });
			},
		});
		setCronScheduler(cronScheduler);
		const started = cronScheduler.start();
		if (started) {
			console.log("[daemon] Cron scheduler started.");
		} else {
			console.warn("[daemon] Cron scheduler lock is held by another process; scheduler not started.");
		}
	}

	console.log("[daemon] Ready. Waiting for messages...");
}

/**
 * Restart channels when config changes (internal helper for config watcher).
 */
async function restartChannels(): Promise<void> {
	console.log("[daemon] Config changed — restarting channels...");

	if (cronScheduler) {
		cronScheduler.stop();
		cronScheduler = null;
		setCronScheduler(null);
	}

	// Stop existing channels
	for (const ch of activeChannels) {
		await ch.stop().catch((err) => {
			console.error(`[daemon] Error stopping channel ${ch.name}:`, err);
		});
	}
	activeChannels = [];

	// Sessions remain cached in sessions.ts and will be reused across restarts
	// Reinitialize with fresh config
	await initializeChannels();

	console.log("[daemon] Channels restarted.");
}

export async function startDaemon(): Promise<void> {
	// Write PID file
	writePidFile();

	console.log(`[daemon] Starting clankie daemon (pid ${process.pid})...`);

	// Initialize notification system
	initNotifications();

	// Initial startup
	await initializeChannels();

	// ─── Config and cron jobs file watchers ──────────────────────────────

	const configPath = getConfigPath();
	const cronJobsPath = getCronJobsPath();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let cronDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	try {
		configWatcher = watch(configPath, (_eventType) => {
			// Debounce: config writes often trigger multiple events (write + chmod)
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				restartChannels().catch((err) => {
					console.error("[daemon] Channel restart failed:", err instanceof Error ? err.message : String(err));
				});
			}, 1000);
		});
		console.log(`[daemon] Watching config file: ${configPath}`);
	} catch (err) {
		console.warn(`[daemon] Could not watch config file: ${err instanceof Error ? err.message : String(err)}`);
	}

	try {
		cronJobsWatcher = watch(cronJobsPath, (_eventType) => {
			if (cronDebounceTimer) clearTimeout(cronDebounceTimer);
			cronDebounceTimer = setTimeout(() => {
				console.log("[daemon] Cron jobs changed — restarting scheduler...");
				if (cronScheduler) {
					cronScheduler.stop();
					const started = cronScheduler.start();
					if (!started) {
						console.warn("[daemon] Could not restart cron scheduler (lock held).");
					}
				}
			}, 1000);
		});
		console.log(`[daemon] Watching cron jobs file: ${cronJobsPath}`);
	} catch (err) {
		console.warn(`[daemon] Could not watch cron jobs file: ${err instanceof Error ? err.message : String(err)}`);
	}

	// ─── Graceful shutdown ────────────────────────────────────────────────

	const shutdown = async (signal: string) => {
		console.log(`\n[daemon] Received ${signal}, shutting down...`);

		// Close file watchers
		if (configWatcher) {
			configWatcher.close();
			configWatcher = null;
		}
		if (cronJobsWatcher) {
			cronJobsWatcher.close();
			cronJobsWatcher = null;
		}

		if (cronScheduler) {
			cronScheduler.stop();
			cronScheduler = null;
			setCronScheduler(null);
		}

		// Stop channels
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

export async function restartDaemon(): Promise<void> {
	const status = isRunning();
	if (!status.running) {
		console.log("Daemon is not running. Starting...");
		await startDaemon();
		return;
	}

	console.log(`Restarting daemon (pid ${status.pid})...`);

	// Stop the daemon
	if (!stopDaemon()) {
		console.error("Failed to stop daemon. Aborting restart.");
		process.exit(1);
	}

	// Wait a moment for cleanup
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Start fresh
	await startDaemon();
}

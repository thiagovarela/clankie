/**
 * Slack channel — uses Socket Mode (WebSocket-based, no public URL needed).
 *
 * Requires:
 * - Slack app with Socket Mode enabled
 * - App token (xapp-...) for Socket Mode connection
 * - Bot token (xoxb-...) for API calls
 * - Bot scopes: app_mentions:read, chat:write, files:read, im:history, mpim:history,
 *   channels:history, channels:read, groups:history, groups:read
 * - Event subscriptions: app_mention, message.channels, message.groups, message.im, message.mpim
 *
 * Responds to:
 * - @mentions in channels and private channels (starts a conversation thread)
 * - Messages in threads where bot was @mentioned (continues conversation)
 * - Direct messages (1:1 and multi-party DMs)
 *
 * Features:
 * - File attachments (downloads from Slack, converts to base64)
 * - Thread persistence (survives daemon restarts, 7-day TTL)
 * - Channel allowlisting (optional)
 * - User allowlisting (required)
 * - Link unfurling disabled (keeps responses clean)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import type { Attachment, Channel, InboundMessage, MessageHandler, SendOptions } from "./channel.ts";

const SLACK_MAX_LENGTH = 4000; // Slack's actual limit is ~40k, but chunk conservatively
const ACTIVE_THREADS_FILE = join(homedir(), ".clankie", "slack-active-threads.json");
const THREAD_TTL_DAYS = 7; // Threads older than this are cleaned up

export interface SlackChannelOptions {
	/** App token from Slack app settings (xapp-...) */
	appToken: string;
	/** Bot token from Slack app settings (xoxb-...) */
	botToken: string;
	/** Allowed Slack user IDs. Empty = deny all. */
	allowedUsers: string[];
	/** Allowed Slack channel IDs. Empty = allow all. */
	allowedChannelIds?: string[];
}

export class SlackChannel implements Channel {
	readonly name = "slack";
	private socketClient: SocketModeClient;
	private webClient: WebClient;
	private allowedUsers: Set<string>;
	private allowedChannelIds: Set<string> | null;
	private handler: MessageHandler | undefined;
	private botUserId: string | null = null;
	/** Threads where bot has been @mentioned - Map<threadId, timestamp> for TTL cleanup */
	private activeThreads: Map<string, number> = new Map();

	constructor(private options: SlackChannelOptions) {
		this.socketClient = new SocketModeClient({
			appToken: options.appToken,
			// biome-ignore lint/suspicious/noExplicitAny: Slack SDK logLevel type is not exported
			logLevel: "ERROR" as any, // Suppress noisy internal logging
		});
		this.webClient = new WebClient(options.botToken);
		this.allowedUsers = new Set(options.allowedUsers);
		// null = allow all channels; Set = filter by channel ID
		this.allowedChannelIds = options.allowedChannelIds?.length ? new Set(options.allowedChannelIds) : null;
	}

	async start(handler: MessageHandler): Promise<void> {
		this.handler = handler;

		// Load persisted active threads
		this.loadActiveThreads();

		// Get bot user ID
		const auth = await this.webClient.auth.test();
		this.botUserId = auth.user_id as string;

		this.setupEventHandlers();
		await this.socketClient.start();

		console.log(`[slack] Connected as ${auth.user} (${this.botUserId})`);
	}

	async send(chatId: string, text: string, options?: SendOptions): Promise<void> {
		if (text.length <= SLACK_MAX_LENGTH) {
			await this.webClient.chat.postMessage({
				channel: chatId,
				text,
				thread_ts: options?.threadId,
				unfurl_links: false,
				unfurl_media: false,
			});
			return;
		}

		// Split long messages
		const chunks = this.splitMessage(text, SLACK_MAX_LENGTH);
		for (const chunk of chunks) {
			await this.webClient.chat.postMessage({
				channel: chatId,
				text: chunk,
				thread_ts: options?.threadId,
				unfurl_links: false,
				unfurl_media: false,
			});
		}
	}

	async stop(): Promise<void> {
		await this.socketClient.disconnect();
		console.log("[slack] Disconnected");
	}

	// ─── Private helpers ──────────────────────────────────────────────────

	/** Check if a channel is allowed (null allowedChannelIds = allow all) */
	private isChannelAllowed(channelId: string): boolean {
		return this.allowedChannelIds === null || this.allowedChannelIds.has(channelId);
	}

	/** Load active threads from disk (with TTL cleanup) */
	private loadActiveThreads(): void {
		if (!existsSync(ACTIVE_THREADS_FILE)) return;

		try {
			const raw = readFileSync(ACTIVE_THREADS_FILE, "utf-8");
			const data = JSON.parse(raw) as Record<string, number>;
			const now = Date.now();
			const ttlMs = THREAD_TTL_DAYS * 24 * 60 * 60 * 1000;

			let loaded = 0;
			let expired = 0;

			for (const [threadId, timestamp] of Object.entries(data)) {
				if (now - timestamp > ttlMs) {
					expired++;
					continue;
				}
				this.activeThreads.set(threadId, timestamp);
				loaded++;
			}

			if (loaded > 0) {
				console.log(`[slack] Loaded ${loaded} active thread(s) from disk${expired > 0 ? ` (${expired} expired)` : ""}`);
			}
		} catch (err) {
			console.warn(`[slack] Failed to load active threads: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/** Save active threads to disk */
	private saveActiveThreads(): void {
		try {
			const dir = join(homedir(), ".clankie");
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true, mode: 0o700 });
			}

			const data: Record<string, number> = {};
			for (const [threadId, timestamp] of this.activeThreads.entries()) {
				data[threadId] = timestamp;
			}

			writeFileSync(ACTIVE_THREADS_FILE, JSON.stringify(data, null, 2), "utf-8");
		} catch (err) {
			console.warn(`[slack] Failed to save active threads: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private setupEventHandlers(): void {
		// Handle @mentions in channels
		this.socketClient.on("app_mention", async ({ event, ack }) => {
			try {
				await ack();

				const e = event as {
					text: string;
					channel: string;
					user: string;
					ts: string;
					thread_ts?: string;
					files?: Array<{
						id: string;
						name?: string;
						mimetype?: string;
						url_private_download?: string;
					}>;
				};

				// Check channel allowlist
				if (!this.isChannelAllowed(e.channel)) {
					console.log(`[slack] Ignoring mention in disallowed channel: ${e.channel}`);
					return;
				}

				if (!this.allowedUsers.has(e.user)) {
					console.log(`[slack] Ignoring mention from unauthorized user: ${e.user}`);
					return;
				}

				// Track this thread as active for future conversation
				const threadId = e.thread_ts || e.ts;
				this.activeThreads.set(threadId, Date.now());
				this.saveActiveThreads();
				console.log(`[slack] Thread ${threadId} is now active (${this.activeThreads.size} total)`);

				// Strip bot mention from text
				const text = e.text.replace(/<@[A-Z0-9]+>/gi, "").trim();

				const message: InboundMessage = {
					id: e.ts,
					channel: this.name,
					senderId: e.user,
					chatId: e.channel,
					threadId: e.thread_ts,
					text,
					timestamp: parseFloat(e.ts) * 1000,
				};

				// Download attachments
				if (e.files && e.files.length > 0) {
					message.attachments = await this.downloadFiles(e.files);
				}

				await this.handler?.(message);
			} catch (err) {
				console.error("[slack] Error in app_mention handler:", err);
			}
		});

		// Handle direct messages and thread replies
		this.socketClient.on("message", async ({ event, ack }) => {
			try {
				await ack();

				const e = event as {
					text?: string;
					channel: string;
					user?: string;
					ts: string;
					channel_type?: string;
					subtype?: string;
					bot_id?: string;
					thread_ts?: string;
					files?: Array<{
						id: string;
						name?: string;
						mimetype?: string;
						url_private_download?: string;
					}>;
				};

				// Skip bot messages, message edits, etc.
				if (e.bot_id || !e.user || e.user === this.botUserId) return;
				if (e.subtype !== undefined && e.subtype !== "file_share") return;
				if (!e.text && (!e.files || e.files.length === 0)) return;

				// Check channel allowlist
				if (!this.isChannelAllowed(e.channel)) return;

				const isDM = e.channel_type === "im";
				const isMpim = e.channel_type === "mpim"; // Multi-party DM
				const isBotMention = e.text?.includes(`<@${this.botUserId}>`);
				const isInActiveThread = e.thread_ts && this.activeThreads.has(e.thread_ts);

				// Skip channel/group @mentions (handled by app_mention event)
				// Note: mpim (multi-party DMs) don't fire app_mention, so we must NOT skip those
				if (!isDM && !isMpim && isBotMention) return;

				// Only process: DMs, multi-party DMs, OR messages in active threads
				if (!isDM && !isMpim && !isInActiveThread) return;

				if (!this.allowedUsers.has(e.user)) {
					console.log(`[slack] Ignoring message from unauthorized user: ${e.user}`);
					return;
				}

				const message: InboundMessage = {
					id: e.ts,
					channel: this.name,
					senderId: e.user,
					chatId: e.channel,
					threadId: e.thread_ts,
					text: e.text || "",
					timestamp: parseFloat(e.ts) * 1000,
				};

				// Download attachments
				if (e.files && e.files.length > 0) {
					message.attachments = await this.downloadFiles(e.files);
				}

				await this.handler?.(message);
			} catch (err) {
				console.error("[slack] Error in message handler:", err);
			}
		});
	}

	/**
	 * Download files from Slack and convert to base64 attachments.
	 */
	private async downloadFiles(
		files: Array<{
			id: string;
			name?: string;
			mimetype?: string;
			url_private_download?: string;
		}>,
	): Promise<Attachment[]> {
		const attachments: Attachment[] = [];

		for (const file of files) {
			const url = file.url_private_download;
			if (!url) {
				console.warn(`[slack] File ${file.id} has no download URL, skipping`);
				continue;
			}

			try {
				const response = await fetch(url, {
					headers: {
						Authorization: `Bearer ${this.options.botToken}`,
					},
				});

				if (!response.ok) {
					console.warn(`[slack] Failed to download file ${file.id}: ${response.status} ${response.statusText}`);
					continue;
				}

				const buffer = Buffer.from(await response.arrayBuffer());
				attachments.push({
					data: buffer.toString("base64"),
					mimeType: file.mimetype || "application/octet-stream",
					fileName: file.name || file.id,
				});
			} catch (err) {
				console.error(`[slack] Error downloading file ${file.id}:`, err);
			}
		}

		return attachments;
	}

	/**
	 * Split a long message into chunks, preferring newline boundaries.
	 */
	private splitMessage(text: string, maxLen: number): string[] {
		const chunks: string[] = [];
		let remaining = text;

		while (remaining.length > 0) {
			if (remaining.length <= maxLen) {
				chunks.push(remaining);
				break;
			}

			// Find last newline within the limit
			let splitAt = remaining.lastIndexOf("\n", maxLen);
			if (splitAt <= 0) {
				// No good newline — hard-split
				splitAt = maxLen;
			}

			chunks.push(remaining.slice(0, splitAt));
			remaining = remaining.slice(splitAt).replace(/^\n/, ""); // trim leading newline
		}

		return chunks;
	}
}

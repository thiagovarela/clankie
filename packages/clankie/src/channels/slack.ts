/**
 * Slack channel — uses Socket Mode (WebSocket-based, no public URL needed).
 *
 * Requires:
 * - Slack app with Socket Mode enabled
 * - App token (xapp-...) for Socket Mode connection
 * - Bot token (xoxb-...) for API calls
 * - Bot scopes: app_mentions:read, chat:write, files:read, im:history, channels:history, channels:read
 * - Event subscriptions: app_mention, message.channels, message.im
 *
 * Responds to:
 * - @mentions in channels (starts a conversation thread)
 * - Messages in threads where bot was @mentioned (continues conversation)
 * - Direct messages
 *
 * Supports file attachments (downloads from Slack, converts to base64).
 */

import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import type { Attachment, Channel, InboundMessage, MessageHandler, SendOptions } from "./channel.ts";

const SLACK_MAX_LENGTH = 4000; // Slack's actual limit is ~40k, but chunk conservatively

export interface SlackChannelOptions {
	/** App token from Slack app settings (xapp-...) */
	appToken: string;
	/** Bot token from Slack app settings (xoxb-...) */
	botToken: string;
	/** Allowed Slack user IDs. Empty = deny all. */
	allowedUsers: string[];
}

export class SlackChannel implements Channel {
	readonly name = "slack";
	private socketClient: SocketModeClient;
	private webClient: WebClient;
	private allowedUsers: Set<string>;
	private handler: MessageHandler | undefined;
	private botUserId: string | null = null;
	/** Threads where bot has been @mentioned - these become active conversations */
	private activeThreads: Set<string> = new Set();

	constructor(private options: SlackChannelOptions) {
		this.socketClient = new SocketModeClient({ appToken: options.appToken });
		this.webClient = new WebClient(options.botToken);
		this.allowedUsers = new Set(options.allowedUsers);
	}

	async start(handler: MessageHandler): Promise<void> {
		this.handler = handler;

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
			});
		}
	}

	async stop(): Promise<void> {
		await this.socketClient.disconnect();
		console.log("[slack] Disconnected");
	}

	// ─── Private helpers ──────────────────────────────────────────────────

	private setupEventHandlers(): void {
		// Handle @mentions in channels
		this.socketClient.on("app_mention", async ({ event, ack }) => {
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

			if (!this.allowedUsers.has(e.user)) {
				console.log(`[slack] Ignoring mention from unauthorized user: ${e.user}`);
				return;
			}

			// Track this thread as active for future conversation
			const threadId = e.thread_ts || e.ts;
			this.activeThreads.add(threadId);
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
		});

		// Handle direct messages and thread replies
		this.socketClient.on("message", async ({ event, ack }) => {
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

			const isDM = e.channel_type === "im";
			const isBotMention = e.text?.includes(`<@${this.botUserId}>`);
			const isInActiveThread = e.thread_ts && this.activeThreads.has(e.thread_ts);

			// Skip channel @mentions (handled by app_mention event)
			if (!isDM && isBotMention) return;

			// Only process: DMs OR messages in active threads
			if (!isDM && !isInActiveThread) return;

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

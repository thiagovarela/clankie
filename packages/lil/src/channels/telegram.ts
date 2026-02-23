/**
 * Telegram channel — uses grammY with long polling.
 *
 * Requires a bot token from @BotFather.
 * Only responds to users in the allowlist (by Telegram user ID).
 *
 * Supports text messages and file attachments (photos, documents,
 * voice notes, audio, video, and video notes).
 */

import { Bot, type Context } from "grammy";
import type { Attachment, Channel, InboundMessage, MessageHandler } from "./channel.ts";

/** Mime type guesses for common Telegram file extensions */
const EXT_MIME: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".pdf": "application/pdf",
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".oga": "audio/ogg",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
};

export interface TelegramChannelOptions {
	/** Bot token from @BotFather */
	token: string;
	/** Allowed Telegram user IDs. Empty = deny all. */
	allowedUsers: number[];
}

export class TelegramChannel implements Channel {
	readonly name = "telegram";
	private bot: Bot;
	private allowedUsers: Set<number>;
	private handler: MessageHandler | undefined;

	constructor(private options: TelegramChannelOptions) {
		this.bot = new Bot(options.token);
		this.allowedUsers = new Set(options.allowedUsers);
	}

	async start(handler: MessageHandler): Promise<void> {
		this.handler = handler;

		// ── Register bot commands ─────────────────────────────────────────
		try {
			// Clear any old commands first
			await this.bot.api.deleteMyCommands();

			// Register only the commands we want
			await this.bot.api.setMyCommands([
				{ command: "switch", description: "Switch to a different conversation (e.g., /switch coding)" },
				{ command: "sessions", description: "List all your conversation sessions" },
				{ command: "new", description: "Start fresh and clear current session context" },
			]);

			console.log("[telegram] Registered bot commands");
		} catch (err) {
			console.warn("[telegram] Failed to register commands:", err);
		}

		// ── Text-only messages ────────────────────────────────────────────
		this.bot.on("message:text", async (ctx) => {
			const msg = this.buildBaseMessage(ctx);
			if (!msg) return;

			msg.text = ctx.msg.text;
			await this.handler?.(msg);
		});

		// ── Photos ────────────────────────────────────────────────────────
		this.bot.on("message:photo", async (ctx) => {
			const msg = this.buildBaseMessage(ctx);
			if (!msg) return;

			msg.text = ctx.msg.caption ?? "";

			// Telegram sends multiple sizes; pick the largest
			const photo = ctx.msg.photo[ctx.msg.photo.length - 1];
			const attachment = await this.downloadFile(photo.file_id, "photo.jpg", "image/jpeg");
			if (attachment) msg.attachments = [attachment];

			await this.handler?.(msg);
		});

		// ── Documents (files) ─────────────────────────────────────────────
		this.bot.on("message:document", async (ctx) => {
			const msg = this.buildBaseMessage(ctx);
			if (!msg) return;

			msg.text = ctx.msg.caption ?? "";

			const doc = ctx.msg.document;
			const attachment = await this.downloadFile(
				doc.file_id,
				doc.file_name ?? "document",
				doc.mime_type ?? "application/octet-stream",
			);
			if (attachment) msg.attachments = [attachment];

			await this.handler?.(msg);
		});

		// ── Voice notes ───────────────────────────────────────────────────
		this.bot.on("message:voice", async (ctx) => {
			const msg = this.buildBaseMessage(ctx);
			if (!msg) return;

			msg.text = ctx.msg.caption ?? "";

			const voice = ctx.msg.voice;
			const attachment = await this.downloadFile(voice.file_id, "voice.ogg", voice.mime_type ?? "audio/ogg");
			if (attachment) msg.attachments = [attachment];

			await this.handler?.(msg);
		});

		// ── Audio files ───────────────────────────────────────────────────
		this.bot.on("message:audio", async (ctx) => {
			const msg = this.buildBaseMessage(ctx);
			if (!msg) return;

			msg.text = ctx.msg.caption ?? "";

			const audio = ctx.msg.audio;
			const attachment = await this.downloadFile(
				audio.file_id,
				audio.file_name ?? "audio.mp3",
				audio.mime_type ?? "audio/mpeg",
			);
			if (attachment) msg.attachments = [attachment];

			await this.handler?.(msg);
		});

		// ── Video ─────────────────────────────────────────────────────────
		this.bot.on("message:video", async (ctx) => {
			const msg = this.buildBaseMessage(ctx);
			if (!msg) return;

			msg.text = ctx.msg.caption ?? "";

			const video = ctx.msg.video;
			const attachment = await this.downloadFile(
				video.file_id,
				video.file_name ?? "video.mp4",
				video.mime_type ?? "video/mp4",
			);
			if (attachment) msg.attachments = [attachment];

			await this.handler?.(msg);
		});

		// ── Video notes (round videos) ───────────────────────────────────
		this.bot.on("message:video_note", async (ctx) => {
			const msg = this.buildBaseMessage(ctx);
			if (!msg) return;

			msg.text = "";

			const vn = ctx.msg.video_note;
			const attachment = await this.downloadFile(vn.file_id, "video_note.mp4", "video/mp4");
			if (attachment) msg.attachments = [attachment];

			await this.handler?.(msg);
		});

		// Start long polling (non-blocking — runs in background)
		this.bot.start({
			drop_pending_updates: false,
			onStart: (botInfo) => {
				console.log(`[telegram] Bot @${botInfo.username} started (long polling)`);
			},
		});
	}

	async send(chatId: string, text: string, options?: { threadId?: string }): Promise<void> {
		// Telegram has a 4096-char limit per message; chunk if needed
		const MAX_LEN = 4096;

		// Prepare send options (thread ID for forum topics)
		const sendOpts = options?.threadId ? { message_thread_id: Number(options.threadId) } : undefined;

		if (text.length <= MAX_LEN) {
			await this.bot.api.sendMessage(chatId, text, sendOpts);
			return;
		}

		// Split on newlines, respecting the limit
		const chunks = splitMessage(text, MAX_LEN);
		for (const chunk of chunks) {
			await this.bot.api.sendMessage(chatId, chunk, sendOpts);
		}
	}

	async stop(): Promise<void> {
		await this.bot.stop();
		console.log("[telegram] Bot stopped");
	}

	// ─── Helpers ────────────────────────────────────────────────────────

	/**
	 * Build a base InboundMessage from a context, returning null if the
	 * sender is not in the allowlist.
	 */
	private buildBaseMessage(ctx: Context): InboundMessage | null {
		const userId = ctx.from?.id;
		if (!userId || !this.allowedUsers.has(userId)) return null;

		// Capture thread ID for forum topics
		const threadId = ctx.msg?.message_thread_id;

		return {
			id: String(ctx.msg?.message_id),
			channel: this.name,
			senderId: String(userId),
			senderName: ctx.from?.first_name + (ctx.from?.last_name ? ` ${ctx.from?.last_name}` : ""),
			chatId: String(ctx.chat?.id),
			threadId: threadId ? String(threadId) : undefined,
			text: "",
			timestamp: ctx.msg?.date * 1000,
		};
	}

	/**
	 * Download a file from Telegram by file_id and return it as a base64
	 * Attachment. Returns undefined if the download fails.
	 *
	 * Telegram Bot API limit: files up to 20 MB.
	 */
	private async downloadFile(
		fileId: string,
		fallbackName: string,
		fallbackMime: string,
	): Promise<Attachment | undefined> {
		try {
			const file = await this.bot.api.getFile(fileId);
			const filePath = file.file_path;
			if (!filePath) {
				console.warn("[telegram] getFile returned no file_path");
				return undefined;
			}

			const url = `https://api.telegram.org/file/bot${this.options.token}/${filePath}`;
			const res = await fetch(url);
			if (!res.ok) {
				console.warn(`[telegram] File download failed: ${res.status} ${res.statusText}`);
				return undefined;
			}

			const buffer = Buffer.from(await res.arrayBuffer());
			const data = buffer.toString("base64");

			// Determine MIME type: prefer fallbackMime, but if it's generic
			// try to guess from the file path extension
			let mimeType = fallbackMime;
			if (mimeType === "application/octet-stream" && filePath) {
				const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
				if (ext in EXT_MIME) mimeType = EXT_MIME[ext];
			}

			// Determine file name
			const fileName = fallbackName || filePath.split("/").pop() || "file";

			return { data, mimeType, fileName };
		} catch (err) {
			console.error("[telegram] Failed to download file:", err);
			return undefined;
		}
	}
}

/** Split a long message into chunks ≤ maxLen, preferring newline boundaries. */
function splitMessage(text: string, maxLen: number): string[] {
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
			// No good newline — just hard-split
			splitAt = maxLen;
		}

		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt).replace(/^\n/, ""); // trim leading newline from next chunk
	}

	return chunks;
}

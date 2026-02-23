/**
 * Channel abstraction — a messaging surface that can receive and send messages.
 *
 * Each channel (Telegram, WhatsApp, Discord, etc.) implements this interface.
 * The daemon routes inbound messages to the agent and delivers responses back.
 */

export interface Attachment {
	/** Base64-encoded file content */
	data: string;
	/** MIME type (e.g. "image/jpeg", "application/pdf") */
	mimeType: string;
	/** Original file name, if available */
	fileName?: string;
}

export interface InboundMessage {
	/** Unique ID for this message (channel-specific) */
	id: string;
	/** Channel type (e.g. "telegram", "whatsapp") */
	channel: string;
	/** Sender identifier (channel-specific user ID) */
	senderId: string;
	/** Sender display name (if available) */
	senderName?: string;
	/** Chat/conversation identifier (for per-chat sessions) */
	chatId: string;
	/** Thread/topic ID (e.g., Telegram forum topic) */
	threadId?: string;
	/** Message text */
	text: string;
	/** File attachments (images, documents, audio, etc.) */
	attachments?: Attachment[];
	/** Unix timestamp (ms) */
	timestamp: number;
}

export type MessageHandler = (message: InboundMessage) => Promise<void>;

export interface SendOptions {
	/** Thread/topic ID for sending to a specific thread */
	threadId?: string;
}

export interface Channel {
	/** Channel type identifier */
	readonly name: string;

	/** Start receiving messages. Calls handler for each inbound message. */
	start(handler: MessageHandler): Promise<void>;

	/** Send a text message to a chat */
	send(chatId: string, text: string, options?: SendOptions): Promise<void>;

	/** Gracefully stop the channel */
	stop(): Promise<void>;
}

/**
 * Type definitions for our chat UI
 * Simple, clean types for server-side agent architecture
 */

export interface Message {
	role: "user" | "assistant";
	content: string;
	timestamp?: number;
	thinking?: string;
	toolCalls?: ToolCall[];
	attachments?: Attachment[];
}

export interface ToolCall {
	id: string;
	name: string;
	parameters: Record<string, unknown>;
	result?: string;
	error?: string;
}

export interface Attachment {
	id: string;
	fileName: string;
	mimeType: string;
	size: number;
	data: string; // base64 data URL
	type: "image" | "document";
	preview?: string;
}

export interface Session {
	id: string;
	title?: string;
	createdAt?: number;
	updatedAt?: number;
}

export interface AppState {
	connected: boolean;
	sessions: Session[];
	currentSessionId: string | null;
	messages: Message[];
	isStreaming: boolean;
	streamingContent: string;
	streamingThinking?: string;
	streamingToolCalls?: ToolCall[];
}

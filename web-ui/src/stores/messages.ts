/**
 * Messages store — manages chat message history and streaming state.
 * Handles incremental token updates during assistant streaming.
 */

import { Store } from "@tanstack/store";
import type { Message } from "@/lib/types";

export interface DisplayMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	isStreaming?: boolean;
	thinkingContent?: string;
	isThinking?: boolean;
}

export interface MessagesStore {
	messages: Array<DisplayMessage>;
	streamingContent: string;
	thinkingContent: string;
	currentMessageId: string | null;
}

const INITIAL_STATE: MessagesStore = {
	messages: [],
	streamingContent: "",
	thinkingContent: "",
	currentMessageId: null,
};

export const messagesStore = new Store<MessagesStore>(INITIAL_STATE);

// ─── Actions ───────────────────────────────────────────────────────────────────

export function addUserMessage(content: string): void {
	const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

	messagesStore.setState((state) => ({
		...state,
		messages: [
			...state.messages,
			{
				id,
				role: "user",
				content,
				timestamp: Date.now(),
			},
		],
	}));
}

export function startAssistantMessage(): void {
	const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

	messagesStore.setState((state) => ({
		...state,
		currentMessageId: id,
		streamingContent: "",
		messages: [
			...state.messages,
			{
				id,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
				isStreaming: true,
			},
		],
	}));
}

export function appendStreamToken(accumulated: string): void {
	messagesStore.setState((state) => {
		if (!state.currentMessageId) return state;

		return {
			...state,
			streamingContent: accumulated,
			messages: state.messages.map((msg) =>
				msg.id === state.currentMessageId ? { ...msg, content: accumulated, isStreaming: true } : msg,
			),
		};
	});
}

export function endAssistantMessage(): void {
	messagesStore.setState((state) => ({
		...state,
		streamingContent: "",
		thinkingContent: "",
		currentMessageId: null,
		messages: state.messages.map((msg) =>
			msg.id === state.currentMessageId ? { ...msg, isStreaming: false, isThinking: false } : msg,
		),
	}));
}

export function startThinking(): void {
	messagesStore.setState((state) => {
		if (!state.currentMessageId) return state;

		return {
			...state,
			thinkingContent: "",
			messages: state.messages.map((msg) => (msg.id === state.currentMessageId ? { ...msg, isThinking: true } : msg)),
		};
	});
}

export function appendThinkingToken(accumulated: string): void {
	messagesStore.setState((state) => {
		if (!state.currentMessageId) return state;

		return {
			...state,
			thinkingContent: accumulated,
			messages: state.messages.map((msg) =>
				msg.id === state.currentMessageId ? { ...msg, thinkingContent: accumulated } : msg,
			),
		};
	});
}

export function endThinking(): void {
	messagesStore.setState((state) => {
		if (!state.currentMessageId) return state;

		return {
			...state,
			messages: state.messages.map((msg) => (msg.id === state.currentMessageId ? { ...msg, isThinking: false } : msg)),
		};
	});
}

export function setMessages(messages: Array<Message>): void {
	// Convert pi's Message format to DisplayMessage format
	const displayMessages: Array<DisplayMessage> = messages.map((msg, idx) => {
		const textContent = msg.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n\n");

		return {
			id: `msg-${idx}`,
			role: msg.role,
			content: textContent,
			timestamp: Date.now() - (messages.length - idx) * 1000, // Approximate timestamps
		};
	});

	messagesStore.setState((state) => ({
		...state,
		messages: displayMessages,
	}));
}

export function clearMessages(): void {
	messagesStore.setState(INITIAL_STATE);
}

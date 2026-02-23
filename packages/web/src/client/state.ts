/**
 * Application state management
 * Reactive store that syncs with WebSocket messages
 */

import type { AppState, Message, Session, ToolCall } from "./types.ts";

type Listener = () => void;

/**
 * Reactive state store
 */
class State {
	private state: AppState = {
		connected: false,
		sessions: [],
		currentSessionId: null,
		messages: [],
		isStreaming: false,
		streamingContent: "",
		streamingThinking: undefined,
		streamingToolCalls: undefined,
	};

	private listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify() {
		for (const listener of this.listeners) {
			listener();
		}
	}

	// Getters
	get connected() {
		return this.state.connected;
	}
	get sessions() {
		return this.state.sessions;
	}
	get currentSessionId() {
		return this.state.currentSessionId;
	}
	get messages() {
		return this.state.messages;
	}
	get isStreaming() {
		return this.state.isStreaming;
	}
	get streamingContent() {
		return this.state.streamingContent;
	}
	get streamingThinking() {
		return this.state.streamingThinking;
	}
	get streamingToolCalls() {
		return this.state.streamingToolCalls;
	}

	// Mutations
	setConnected(connected: boolean) {
		this.state.connected = connected;
		this.notify();
	}

	setSessions(sessions: Session[]) {
		this.state.sessions = sessions;
		this.notify();
	}

	setCurrentSession(sessionId: string | null) {
		this.state.currentSessionId = sessionId;
		this.notify();
	}

	setMessages(messages: Message[]) {
		this.state.messages = messages;
		this.notify();
	}

	addMessage(message: Message) {
		this.state.messages = [...this.state.messages, message];
		this.notify();
	}

	startStreaming() {
		this.state.isStreaming = true;
		this.state.streamingContent = "";
		this.state.streamingThinking = undefined;
		this.state.streamingToolCalls = undefined;
		this.notify();
	}

	updateStreaming(content: string, thinking?: string, toolCalls?: ToolCall[]) {
		this.state.streamingContent = content;
		this.state.streamingThinking = thinking;
		this.state.streamingToolCalls = toolCalls;
		this.notify();
	}

	finishStreaming() {
		// Add the streamed message to the message list
		if (this.state.streamingContent || this.state.streamingToolCalls?.length) {
			this.addMessage({
				role: "assistant",
				content: this.state.streamingContent,
				thinking: this.state.streamingThinking,
				toolCalls: this.state.streamingToolCalls,
				timestamp: Date.now(),
			});
		}

		this.state.isStreaming = false;
		this.state.streamingContent = "";
		this.state.streamingThinking = undefined;
		this.state.streamingToolCalls = undefined;
		this.notify();
	}

	clearStreaming() {
		this.state.isStreaming = false;
		this.state.streamingContent = "";
		this.state.streamingThinking = undefined;
		this.state.streamingToolCalls = undefined;
		this.notify();
	}
}

export const state = new State();

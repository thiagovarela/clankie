/**
 * Reactive state management
 *
 * Maps WebSocket state to pi-agent-core compatible types for pi-web-ui components.
 */

import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { WsClient, WsEventMessage, WsIncomingMessage, WsStateMessage } from "./ws-client.ts";

export interface AppState {
	messages: AgentMessage[];
	tools: AgentTool[];
	isStreaming: boolean;
	streamMessage: AgentMessage | null;
	pendingToolCalls: Set<string>;
	sessionName: string;
	sessions: string[];
	model: {
		provider: string;
		id: string;
		name: string;
	} | null;
	thinkingLevel: string;
	error?: unknown;
	persona: {
		name: string;
	};
	connected: boolean;
}

// Simple observable state
class StateStore {
	private _state: AppState = {
		messages: [],
		tools: [],
		isStreaming: false,
		streamMessage: null,
		pendingToolCalls: new Set(),
		sessionName: "default",
		sessions: [],
		model: null,
		thinkingLevel: "off",
		persona: { name: "default" },
		connected: false,
	};

	private listeners: Set<() => void> = new Set();

	get value(): AppState {
		return this._state;
	}

	set value(newState: AppState) {
		this._state = newState;
		this.notify();
	}

	update(partial: Partial<AppState>) {
		this._state = { ...this._state, ...partial };
		this.notify();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify() {
		this.listeners.forEach((listener) => listener());
	}
}

export const state = new StateStore();

function processState(wsState: WsStateMessage["state"]): Partial<AppState> {
	return {
		messages: wsState.messages as AgentMessage[],
		tools: wsState.tools as AgentTool[],
		isStreaming: wsState.isStreaming,
		streamMessage: wsState.streamMessage as AgentMessage | null,
		pendingToolCalls: new Set(wsState.pendingToolCalls),
		model: wsState.model,
		thinkingLevel: wsState.thinkingLevel,
		error: wsState.error,
	};
}

export function initializeState(wsClient: WsClient): void {
	wsClient.subscribe((message: WsIncomingMessage) => {
		if (message.type === "state") {
			// Full state update
			state.update({
				...processState(message.state),
				sessionName: message.sessionName,
			});
		} else if (message.type === "event") {
			// Event with partial state update
			const eventMsg = message as WsEventMessage;
			state.update(processState(eventMsg.state));
		} else if (message.type === "ready") {
			// Initial connection ready
			state.update({
				sessionName: message.sessionName,
				sessions: message.sessions,
				persona: message.persona || { name: "default" },
				connected: true,
			});
		} else if (message.type === "response") {
			// Response to commands - may include sessions list
			if ("sessions" in message && Array.isArray(message.sessions)) {
				state.update({
					sessions: message.sessions,
				});
			}
		}
	});

	// Track connection status
	const checkConnection = () => {
		state.update({
			connected: wsClient.connected,
		});
	};

	setInterval(checkConnection, 1000);
}

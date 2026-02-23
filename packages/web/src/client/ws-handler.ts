/**
 * Centralized WebSocket message handler
 * Processes all incoming WS messages and updates global state
 */

import { state } from "./state.ts";
import type { Message, ToolCall } from "./types.ts";
import type { WsIncomingMessage } from "./ws-client.ts";

/**
 * Convert server message format to client Message format
 */
function convertMessages(serverMessages: unknown[]): Message[] {
	return serverMessages.map((msg: unknown) => {
		const m = msg as Record<string, unknown>;

		// Extract text from content parts array
		// Server format: content: [{type: "text", text: "..."}]
		let textContent = "";
		const contentParts = Array.isArray(m.content) ? m.content : [];
		for (const part of contentParts) {
			if (typeof part === "object" && part !== null) {
				const p = part as Record<string, unknown>;
				if (p.type === "text" && typeof p.text === "string") {
					textContent += p.text;
				}
			}
		}

		return {
			role: m.role as "user" | "assistant",
			content: textContent,
			timestamp: m.timestamp as number | undefined,
			thinking: m.thinking as string | undefined,
			toolCalls: m.tool_calls as ToolCall[] | undefined,
			attachments: undefined, // Attachments would come from file uploads
		};
	});
}

/**
 * Handle all incoming WebSocket messages and update global state
 */
export function handleWsMessage(message: WsIncomingMessage): void {
	if (message.type === "ready") {
		state.setConnected(true);
		// Store available sessions
		const sessions = message.sessions.map((name) => ({ id: name }));
		state.setSessions(sessions);
		state.setCurrentSession(message.sessionName);
	} else if (message.type === "state") {
		// Full state update - convert server messages to our format
		const messages = convertMessages(message.state.messages);
		state.setMessages(messages);

		// Handle streaming state
		if (message.state.isStreaming && message.state.streamMessage) {
			state.startStreaming();
			const streamMsg = message.state.streamMessage as Record<string, unknown>;
			state.updateStreaming(
				(streamMsg.content as string) || "",
				streamMsg.thinking as string | undefined,
				streamMsg.tool_calls as ToolCall[] | undefined,
			);
		} else if (!message.state.isStreaming && state.isStreaming) {
			state.finishStreaming();
		}
	} else if (message.type === "event") {
		// Handle incremental events
		const eventType = message.event.type;

		if (eventType === "streaming_start") {
			state.startStreaming();
		} else if (eventType === "content_delta") {
			const delta = message.event.delta as string;
			state.updateStreaming(state.streamingContent + delta, state.streamingThinking, state.streamingToolCalls);
		} else if (eventType === "streaming_done") {
			state.finishStreaming();
		} else if (eventType === "tool_call") {
			// Add or update tool call in streaming state
			const toolCall = message.event.tool as ToolCall;
			const currentCalls = state.streamingToolCalls || [];
			const existingIndex = currentCalls.findIndex((t) => t.id === toolCall.id);

			let updatedCalls: ToolCall[];
			if (existingIndex >= 0) {
				updatedCalls = [...currentCalls];
				updatedCalls[existingIndex] = toolCall;
			} else {
				updatedCalls = [...currentCalls, toolCall];
			}

			state.updateStreaming(state.streamingContent, state.streamingThinking, updatedCalls);
		}
	} else if (message.type === "response") {
		// Handle response messages (e.g., from session.list)
		if ((message as { sessions?: string[] }).sessions) {
			const sessions = ((message as { sessions?: string[] }).sessions || []).map((name) => ({ id: name }));
			state.setSessions(sessions);
		}
	}
}

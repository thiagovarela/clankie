/**
 * Test data factories
 */

import type {
	AgentSessionEvent,
	AuthEvent,
	AuthProvider,
	ModelInfo,
	SessionState,
	ThinkingLevel,
} from "@/lib/types";
import type { DisplayMessage } from "@/stores/messages";
import type { SessionListItem } from "@/stores/sessions-list";

// ─── Model Info ────────────────────────────────────────────────────────────────

export function makeModelInfo(overrides?: Partial<ModelInfo>): ModelInfo {
	return {
		provider: "anthropic",
		id: "claude-3-5-sonnet-20241022",
		name: "Claude 3.5 Sonnet",
		inputPrice: 0.003,
		outputPrice: 0.015,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: true,
		...overrides,
	};
}

// ─── Session State ─────────────────────────────────────────────────────────────

export function makeSessionState(overrides?: Partial<SessionState>): SessionState {
	return {
		model: makeModelInfo(),
		thinkingLevel: "medium",
		isStreaming: false,
		isCompacting: false,
		steeringMode: "one-at-a-time",
		followUpMode: "one-at-a-time",
		sessionFile: "/path/to/session.json",
		sessionId: "test-session-123",
		sessionName: "Test Session",
		autoCompactionEnabled: false,
		messageCount: 0,
		pendingMessageCount: 0,
		...overrides,
	};
}

// ─── Session List Item ─────────────────────────────────────────────────────────

export function makeSessionListItem(overrides?: Partial<SessionListItem>): SessionListItem {
	return {
		sessionId: `session-${Date.now()}`,
		title: "Test Session",
		messageCount: 0,
		createdAt: Date.now(),
		...overrides,
	};
}

// ─── Display Message ───────────────────────────────────────────────────────────

export function makeDisplayMessage(overrides?: Partial<DisplayMessage>): DisplayMessage {
	return {
		id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		role: "user",
		content: "Test message",
		timestamp: Date.now(),
		...overrides,
	};
}

// ─── Auth Provider ─────────────────────────────────────────────────────────────

export function makeAuthProvider(overrides?: Partial<AuthProvider>): AuthProvider {
	return {
		id: "anthropic",
		name: "Anthropic",
		type: "oauth",
		hasAuth: false,
		usesCallbackServer: true,
		...overrides,
	};
}

// ─── Auth Events ───────────────────────────────────────────────────────────────

export function makeAuthEventUrl(
	loginFlowId: string,
	url: string,
	instructions?: string,
): Extract<AuthEvent, { event: "url" }> {
	return {
		type: "auth_event",
		loginFlowId,
		event: "url",
		url,
		instructions,
	};
}

export function makeAuthEventPrompt(
	loginFlowId: string,
	message: string,
	placeholder?: string,
): Extract<AuthEvent, { event: "prompt" }> {
	return {
		type: "auth_event",
		loginFlowId,
		event: "prompt",
		message,
		placeholder,
	};
}

export function makeAuthEventComplete(
	loginFlowId: string,
	success: boolean,
	error?: string,
): Extract<AuthEvent, { event: "complete" }> {
	return {
		type: "auth_event",
		loginFlowId,
		event: "complete",
		success,
		error,
	};
}

// ─── Agent Session Events ──────────────────────────────────────────────────────

export function makeSessionStartEvent(sessionId: string): Extract<AgentSessionEvent, { type: "session_start" }> {
	return {
		type: "session_start",
		sessionId,
	};
}

export function makeModelChangedEvent(model: ModelInfo): Extract<AgentSessionEvent, { type: "model_changed" }> {
	return {
		type: "model_changed",
		model,
	};
}

export function makeThinkingLevelChangedEvent(
	level: ThinkingLevel,
): Extract<AgentSessionEvent, { type: "thinking_level_changed" }> {
	return {
		type: "thinking_level_changed",
		level,
	};
}

export function makeSessionNameChangedEvent(name: string): Extract<AgentSessionEvent, { type: "session_name_changed" }> {
	return {
		type: "session_name_changed",
		name,
	};
}

export function makeStateUpdateEvent(state: SessionState): Extract<AgentSessionEvent, { type: "state_update" }> {
	return {
		type: "state_update",
		state,
	};
}

export function makeAgentStartEvent(): Extract<AgentSessionEvent, { type: "agent_start" }> {
	return {
		type: "agent_start",
	};
}

export function makeAgentEndEvent(messages: any[] = []): Extract<AgentSessionEvent, { type: "agent_end" }> {
	return {
		type: "agent_end",
		messages,
	};
}

export function makeMessageStartEvent(message: any): Extract<AgentSessionEvent, { type: "message_start" }> {
	return {
		type: "message_start",
		message,
	};
}

export function makeMessageEndEvent(message: any): Extract<AgentSessionEvent, { type: "message_end" }> {
	return {
		type: "message_end",
		message,
	};
}

export function makeCompactStartEvent(): Extract<AgentSessionEvent, { type: "compact_start" }> {
	return {
		type: "compact_start",
	};
}

export function makeCompactEndEvent(
	originalCount: number,
	compactedCount: number,
): Extract<AgentSessionEvent, { type: "compact_end" }> {
	return {
		type: "compact_end",
		originalCount,
		compactedCount,
	};
}

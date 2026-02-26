/**
 * Test data factories — helper functions to create test fixtures.
 */

import type {
  AgentSessionEvent,
  AuthEvent,
  ModelInfo,
  SessionState,
  ThinkingLevel,
} from '@/lib/types'
import type { DisplayMessage } from '@/stores/messages'
import type { SessionListItem } from '@/stores/sessions-list'

// ─── Model fixtures ────────────────────────────────────────────────────────────

export function makeModelInfo(overrides?: Partial<ModelInfo>): ModelInfo {
  return {
    provider: 'anthropic',
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    inputPrice: 3,
    outputPrice: 15,
    contextWindow: 200000,
    supportsImages: true,
    supportsPromptCache: true,
    ...overrides,
  }
}

// ─── Session state fixtures ────────────────────────────────────────────────────

export function makeSessionState(
  overrides?: Partial<SessionState>,
): SessionState {
  return {
    model: makeModelInfo(),
    thinkingLevel: 'normal' as ThinkingLevel,
    isStreaming: false,
    isCompacting: false,
    steeringMode: 'one-at-a-time',
    followUpMode: 'one-at-a-time',
    sessionFile: '/tmp/session-abc123.json',
    sessionId: 'session-abc123',
    sessionName: undefined,
    autoCompactionEnabled: false,
    messageCount: 0,
    pendingMessageCount: 0,
    ...overrides,
  }
}

export function makeSessionListItem(
  overrides?: Partial<SessionListItem>,
): SessionListItem {
  return {
    sessionId: 'session-abc123',
    title: undefined,
    messageCount: 0,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ─── Message fixtures ──────────────────────────────────────────────────────────

export function makeDisplayMessage(
  overrides?: Partial<DisplayMessage>,
): DisplayMessage {
  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: 'Hello, how can I help?',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ─── Agent event fixtures ──────────────────────────────────────────────────────

export function makeAgentStartEvent(): AgentSessionEvent {
  return { type: 'agent_start' }
}

export function makeAgentEndEvent(): AgentSessionEvent {
  return { type: 'agent_end', messages: [] }
}

export function makeMessageStartEvent(
  role: 'user' | 'assistant' = 'assistant',
): AgentSessionEvent {
  return {
    type: 'message_start',
    message: { role, content: [] },
  }
}

export function makeMessageUpdateEvent(
  partialContent: string,
  eventType: 'text_delta' | 'thinking_delta' = 'text_delta',
): AgentSessionEvent {
  const contentType = eventType === 'text_delta' ? 'text' : 'thinking'
  const contentKey = eventType === 'text_delta' ? 'text' : 'thinking'

  return {
    type: 'message_update',
    message: { role: 'assistant', content: [] },
    assistantMessageEvent: {
      type: eventType,
      contentIndex: 0,
      delta: partialContent,
      partial: {
        content: [{ type: contentType, [contentKey]: partialContent }],
      },
    },
  }
}

export function makeThinkingStartEvent(): AgentSessionEvent {
  return {
    type: 'message_update',
    message: { role: 'assistant', content: [] },
    assistantMessageEvent: {
      type: 'thinking_start',
      contentIndex: 0,
      partial: { content: [] },
    },
  }
}

export function makeThinkingEndEvent(): AgentSessionEvent {
  return {
    type: 'message_update',
    message: { role: 'assistant', content: [] },
    assistantMessageEvent: {
      type: 'thinking_end',
      contentIndex: 0,
      content: 'I thought about this...',
      partial: { content: [] },
    },
  }
}

export function makeMessageEndEvent(
  role: 'user' | 'assistant' = 'assistant',
  textContent = 'Hello',
): AgentSessionEvent {
  return {
    type: 'message_end',
    message: {
      role,
      content: [{ type: 'text', text: textContent }],
    },
  }
}

export function makeModelChangedEvent(model?: ModelInfo): AgentSessionEvent {
  return {
    type: 'model_changed',
    model: model || makeModelInfo(),
  }
}

export function makeThinkingLevelChangedEvent(
  level: ThinkingLevel = 'extended',
): AgentSessionEvent {
  return {
    type: 'thinking_level_changed',
    level,
  }
}

export function makeSessionStartEvent(
  sessionId = 'session-new',
): AgentSessionEvent {
  return {
    type: 'session_start',
    sessionId,
  }
}

export function makeSessionNameChangedEvent(name: string): AgentSessionEvent {
  return {
    type: 'session_name_changed',
    name,
  }
}

export function makeStateUpdateEvent(
  state?: Partial<SessionState>,
): AgentSessionEvent {
  return {
    type: 'state_update',
    state: makeSessionState(state),
  }
}

export function makeCompactStartEvent(): AgentSessionEvent {
  return { type: 'compact_start' }
}

export function makeCompactEndEvent(): AgentSessionEvent {
  return {
    type: 'compact_end',
    originalCount: 10,
    compactedCount: 5,
  }
}

// ─── Auth event fixtures ───────────────────────────────────────────────────────

export function makeAuthUrlEvent(
  loginFlowId: string,
  url = 'https://auth.example.com/oauth',
): AuthEvent {
  return {
    type: 'auth_event',
    loginFlowId,
    event: 'url',
    url,
    instructions: 'Click the link to authenticate',
  }
}

export function makeAuthPromptEvent(
  loginFlowId: string,
  message = 'Enter code',
): AuthEvent {
  return {
    type: 'auth_event',
    loginFlowId,
    event: 'prompt',
    message,
    placeholder: 'Paste code here',
  }
}

export function makeAuthProgressEvent(
  loginFlowId: string,
  message = 'Processing...',
): AuthEvent {
  return {
    type: 'auth_event',
    loginFlowId,
    event: 'progress',
    message,
  }
}

export function makeAuthCompleteEvent(
  loginFlowId: string,
  success = true,
  error?: string,
): AuthEvent {
  return {
    type: 'auth_event',
    loginFlowId,
    event: 'complete',
    success,
    error,
  }
}

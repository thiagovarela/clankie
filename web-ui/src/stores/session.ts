/**
 * Session store — manages current agent session state.
 * Updated from agent session events.
 */

import { Store } from '@tanstack/store'
import type { ModelInfo, SessionState, ThinkingLevel } from '@/lib/types'

export interface SessionStore {
  sessionId: string | null
  model: ModelInfo | null
  availableModels: Array<ModelInfo>
  thinkingLevel: ThinkingLevel
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: 'all' | 'one-at-a-time'
  followUpMode: 'all' | 'one-at-a-time'
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
}

const INITIAL_STATE: SessionStore = {
  sessionId: null,
  model: null,
  availableModels: [],
  thinkingLevel: 'medium',
  isStreaming: false,
  isCompacting: false,
  steeringMode: 'one-at-a-time',
  followUpMode: 'one-at-a-time',
  sessionName: undefined,
  autoCompactionEnabled: false,
  messageCount: 0,
}

export const sessionStore = new Store<SessionStore>(INITIAL_STATE)

// ─── Actions ───────────────────────────────────────────────────────────────────

export function setSessionId(sessionId: string): void {
  sessionStore.setState((state) => ({
    ...state,
    sessionId,
  }))
}

export function updateSessionState(sessionState: Partial<SessionState>): void {
  // Destructure to exclude sessionId - we manage that separately with setSessionId()
  const { sessionId: _ignoredSessionId, ...stateWithoutSessionId } =
    sessionState

  sessionStore.setState((state) => ({
    ...state,
    ...stateWithoutSessionId,
  }))
}

export function setModel(model: ModelInfo): void {
  sessionStore.setState((state) => ({
    ...state,
    model,
  }))
}

export function setAvailableModels(models: Array<ModelInfo>): void {
  sessionStore.setState((state) => ({
    ...state,
    availableModels: models,
  }))
}

export function setThinkingLevel(level: ThinkingLevel): void {
  sessionStore.setState((state) => ({
    ...state,
    thinkingLevel: level,
  }))
}

export function setSessionName(name: string): void {
  sessionStore.setState((state) => ({
    ...state,
    sessionName: name,
  }))
}

export function setStreaming(isStreaming: boolean): void {
  sessionStore.setState((state) => ({
    ...state,
    isStreaming,
  }))
}

export function setCompacting(isCompacting: boolean): void {
  sessionStore.setState((state) => ({
    ...state,
    isCompacting,
  }))
}

export function resetSession(): void {
  sessionStore.setState(() => INITIAL_STATE)
}

/**
 * Sessions list store — manages the list of all available sessions
 * and tracks which one is currently active.
 */

import { Store } from '@tanstack/store'

export interface SessionListItem {
  sessionId: string
  title?: string
  messageCount: number
  createdAt: number
}

export interface SessionsListStore {
  sessions: Array<SessionListItem>
  activeSessionId: string | null
}

const INITIAL_STATE: SessionsListStore = {
  sessions: [],
  activeSessionId: null,
}

export const sessionsListStore = new Store<SessionsListStore>(INITIAL_STATE)

// ─── Actions ───────────────────────────────────────────────────────────────────

export function addSession(session: SessionListItem): void {
  sessionsListStore.setState((state) => {
    // Don't add duplicates
    if (state.sessions.some((s) => s.sessionId === session.sessionId)) {
      return state
    }

    return {
      ...state,
      sessions: [...state.sessions, session],
    }
  })
}

export function removeSession(sessionId: string): void {
  sessionsListStore.setState((state) => ({
    ...state,
    sessions: state.sessions.filter((s) => s.sessionId !== sessionId),
    // Clear active if removing active session
    activeSessionId:
      state.activeSessionId === sessionId ? null : state.activeSessionId,
  }))
}

export function setActiveSession(sessionId: string): void {
  sessionsListStore.setState((state) => ({
    ...state,
    activeSessionId: sessionId,
  }))
}

export function updateSessionMeta(
  sessionId: string,
  updates: Partial<Omit<SessionListItem, 'sessionId' | 'createdAt'>>,
): void {
  sessionsListStore.setState((state) => ({
    ...state,
    sessions: state.sessions.map((s) =>
      s.sessionId === sessionId ? { ...s, ...updates } : s,
    ),
  }))
}

export function clearSessions(): void {
  sessionsListStore.setState(INITIAL_STATE)
}

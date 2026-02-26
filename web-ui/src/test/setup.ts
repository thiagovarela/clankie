/**
 * Global test setup — runs before all tests
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { authStore } from '@/stores/auth'
import { connectionStore } from '@/stores/connection'
import { extensionsStore } from '@/stores/extensions'
import { messagesStore } from '@/stores/messages'
import { sessionStore } from '@/stores/session'
import { sessionsListStore } from '@/stores/sessions-list'

// Store initial states for reset
const INITIAL_AUTH_STATE = {
  providers: [],
  isLoadingProviders: false,
  loginFlow: null,
}

const INITIAL_CONNECTION_STATE = {
  settings: {
    url: 'ws://localhost:3100',
    authToken: '',
  },
  status: 'disconnected' as const,
  error: undefined,
}

const INITIAL_EXTENSIONS_STATE = {
  extensions: [],
  extensionErrors: [],
  skills: [],
  skillDiagnostics: [],
  isLoading: false,
  installStatus: {
    isInstalling: false,
    output: '',
    exitCode: null,
  },
}

const INITIAL_MESSAGES_STATE = {
  messages: [],
  streamingContent: '',
  thinkingContent: '',
  currentMessageId: null,
}

const INITIAL_SESSION_STATE = {
  sessionId: null,
  model: null,
  availableModels: [],
  thinkingLevel: 'medium' as const,
  isStreaming: false,
  isCompacting: false,
  steeringMode: 'one-at-a-time' as const,
  followUpMode: 'one-at-a-time' as const,
  sessionName: undefined,
  autoCompactionEnabled: false,
  messageCount: 0,
}

const INITIAL_SESSIONS_LIST_STATE = {
  sessions: [],
  activeSessionId: null,
}

/**
 * Reset all stores to their initial state
 */
export function resetAllStores(): void {
  authStore.setState(() => INITIAL_AUTH_STATE)
  connectionStore.setState(() => INITIAL_CONNECTION_STATE)
  extensionsStore.setState(() => INITIAL_EXTENSIONS_STATE)
  messagesStore.setState(() => INITIAL_MESSAGES_STATE)
  sessionStore.setState(() => INITIAL_SESSION_STATE)
  sessionsListStore.setState(() => INITIAL_SESSIONS_LIST_STATE)
}

// Clean up after each test
afterEach(() => {
  cleanup()
})

// Reset stores before each test
beforeEach(() => {
  resetAllStores()
  // Clear localStorage
  localStorage.clear()
  // Mock scrollIntoView (not implemented in jsdom)
  Element.prototype.scrollIntoView = vi.fn()
})

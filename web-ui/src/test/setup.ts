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
import { toolExecutionsStore } from '@/stores/tool-executions'
import { resetTheme } from '@/stores/theme'

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
    useCookieAuth: false,
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

const INITIAL_TOOL_EXECUTIONS_STATE = {
  executions: {},
  executionOrder: [],
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
  toolExecutionsStore.setState(() => INITIAL_TOOL_EXECUTIONS_STATE)
  resetTheme()
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

  // Mock ResizeObserver (used by cmdk)
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // Mock matchMedia for theme system mode
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

/**
 * Test setup file — runs before each test suite.
 * Configures jsdom environment, @testing-library cleanup, and store resets.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Import all stores
import { authStore } from '@/stores/auth'
import { connectionStore } from '@/stores/connection'
import { extensionsStore } from '@/stores/extensions'
import { messagesStore } from '@/stores/messages'
import { sessionStore } from '@/stores/session'
import { sessionsListStore } from '@/stores/sessions-list'

// Cleanup after each test (unmount React components)
afterEach(() => {
  cleanup()
})

// Reset all stores to initial state before each test
beforeEach(() => {
  resetAllStores()
  // Clear localStorage (only if available in environment)
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
})

/**
 * Reset all stores to their initial states.
 * Call this in beforeEach or when needed.
 */
export function resetAllStores(): void {
  // Auth store
  authStore.setState(() => ({
    providers: [],
    isLoadingProviders: false,
    loginFlow: null,
  }))

  // Connection store
  connectionStore.setState(() => ({
    settings: {
      url: 'ws://localhost:3100',
      authToken: '',
    },
    status: 'disconnected',
    error: undefined,
  }))

  // Extensions store
  extensionsStore.setState(() => ({
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
  }))

  // Messages store
  messagesStore.setState(() => ({
    messages: [],
    streamingContent: '',
    thinkingContent: '',
    currentMessageId: null,
  }))

  // Session store
  sessionStore.setState(() => ({
    sessionId: null,
    model: null,
    availableModels: [],
    thinkingLevel: 'normal',
    isStreaming: false,
    isCompacting: false,
    steeringMode: 'one-at-a-time',
    followUpMode: 'one-at-a-time',
    sessionName: undefined,
    autoCompactionEnabled: false,
    messageCount: 0,
  }))

  // Sessions list store
  sessionsListStore.setState(() => ({
    sessions: [],
    activeSessionId: null,
  }))
}

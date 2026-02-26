/**
 * Client manager — singleton that manages the clankie client and updates stores.
 */

import { ClankieClient } from './clankie-client'
import { handleAuthEvent, handleSessionEvent } from './event-handlers'
import { connectionStore, updateConnectionStatus } from '@/stores/connection'
import { clearMessages, setMessages } from '@/stores/messages'
import {
  resetSession,
  setAvailableModels,
  setModel,
  setSessionId,
  setSessionName,
  setThinkingLevel,
  updateSessionState,
} from '@/stores/session'
import {
  addSession,
  clearSessions,
  sessionsListStore,
  setActiveSession,
} from '@/stores/sessions-list'

class ClientManager {
  private client: ClankieClient | null = null

  connect(): void {
    if (this.client) {
      console.warn('Client already connected')
      return
    }

    const { settings } = connectionStore.state

    if (!settings.authToken) {
      updateConnectionStatus('error', 'Auth token is required')
      return
    }

    this.client = new ClankieClient({
      url: settings.url,
      authToken: settings.authToken,
      onEvent: (sessionId, event) => {
        const { activeSessionId } = sessionsListStore.state
        handleSessionEvent(sessionId, event, activeSessionId)
      },
      onAuthEvent: (event) => handleAuthEvent(event),
      onStateChange: (state, error) => {
        updateConnectionStatus(state, error)
        // Restore or create session when connection is established
        if (state === 'connected') {
          this.restoreOrCreateSession()
        }
      },
    })

    this.client.connect()
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect()
      this.client = null
    }
    // Clear sessions list on disconnect
    clearSessions()
    resetSession()
    clearMessages()
    // Note: We keep the session ID in localStorage so it can be restored on reconnect
  }

  private async restoreOrCreateSession(): Promise<void> {
    if (!this.client) {
      console.error('[client-manager] Cannot restore session: not connected')
      return
    }

    try {
      // First, load all available sessions from the server
      await this.loadAllSessions()

      // Try to restore the last active session from localStorage
      const savedSessionId = localStorage.getItem('clankie-last-session-id')

      if (savedSessionId) {
        console.log(
          `[client-manager] Attempting to restore session: ${savedSessionId}`,
        )
        try {
          // Try to switch to the saved session (this will fail if session doesn't exist)
          await this.switchSession(savedSessionId)
          console.log(
            `[client-manager] Successfully restored session: ${savedSessionId}`,
          )
          return
        } catch (err) {
          console.warn(
            `[client-manager] Failed to restore session ${savedSessionId}, creating new:`,
            err,
          )
          // Clear the invalid session ID
          localStorage.removeItem('clankie-last-session-id')
        }
      }

      // No saved session or restoration failed - create a new one
      console.log('[client-manager] Creating new session')
      await this.createNewSession()
    } catch (err) {
      console.error(
        '[client-manager] Failed to restore or create session:',
        err,
      )
    }
  }

  private async loadAllSessions(): Promise<void> {
    if (!this.client) {
      console.error('[client-manager] Cannot load sessions: not connected')
      return
    }

    try {
      const { sessions } = await this.client.listSessions()
      console.log(
        `[client-manager] Loaded ${sessions.length} sessions from server:`,
        sessions,
      )

      // Add all sessions to the store (clear first to avoid duplicates)
      clearSessions()
      for (const session of sessions) {
        console.log(`[client-manager] Adding session to store:`, session)
        addSession({
          sessionId: session.sessionId,
          title: session.title,
          messageCount: session.messageCount,
          createdAt: Date.now(),
        })
      }
    } catch (err) {
      console.error('[client-manager] Failed to load sessions:', err)
    }
  }

  getClient(): ClankieClient | null {
    return this.client
  }

  isConnected(): boolean {
    return this.client?.getConnectionState() === 'connected'
  }

  // ─── Session management ────────────────────────────────────────────────────

  async createNewSession(): Promise<string | null> {
    if (!this.client) {
      console.error('[client-manager] Cannot create session: not connected')
      return null
    }

    try {
      console.log('[client-manager] Requesting new session from server...')
      const result = await this.client.newSession()
      console.log('[client-manager] Received new session result:', result)

      if (result.cancelled) {
        console.log('[client-manager] Session creation cancelled')
        return null
      }

      // Optimistically add session to the list immediately
      // (session_start event will update metadata later)
      console.log(
        `[client-manager] Creating new session with ID: ${result.sessionId}`,
      )
      addSession({
        sessionId: result.sessionId,
        title: undefined,
        messageCount: 0,
        createdAt: Date.now(),
      })

      // Set it as active
      setActiveSession(result.sessionId)

      // Set the session ID immediately so chat input works right away
      setSessionId(result.sessionId)

      // Save to localStorage for persistence across page refreshes
      localStorage.setItem('clankie-last-session-id', result.sessionId)

      // Clear messages for the new session
      clearMessages()

      // Fetch session state to get model and thinking level
      try {
        const state = await this.client.getState(result.sessionId)
        setModel(state.model)
        setThinkingLevel(state.thinkingLevel)
        updateSessionState(state)

        // Fetch available models
        const { models } = await this.client.getAvailableModels(
          result.sessionId,
        )
        setAvailableModels(models)
      } catch (err) {
        console.error(
          '[client-manager] Failed to fetch session state or models:',
          err,
        )
      }

      return result.sessionId
    } catch (err) {
      console.error('[client-manager] Failed to create session:', err)
      return null
    }
  }

  async switchSession(sessionId: string): Promise<void> {
    if (!this.client) {
      console.error('[client-manager] Cannot switch session: not connected')
      return
    }

    try {
      // Set as active session
      setActiveSession(sessionId)

      // Set the session ID immediately so chat input works right away
      setSessionId(sessionId)

      // Save to localStorage for persistence across page refreshes
      localStorage.setItem('clankie-last-session-id', sessionId)

      // Clear current messages
      clearMessages()

      // Fetch messages for the new session
      console.log(
        `[client-manager] Fetching messages for session: ${sessionId}`,
      )
      const { messages } = await this.client.getMessages(sessionId)
      console.log(
        `[client-manager] Loaded ${messages.length} messages for session ${sessionId}`,
      )
      setMessages(messages)

      // Fetch and update session state
      const state = await this.client.getState(sessionId)
      setSessionId(sessionId)
      setModel(state.model)
      setThinkingLevel(state.thinkingLevel)
      if (state.sessionName) {
        setSessionName(state.sessionName)
      }
      updateSessionState(state)

      // Fetch available models
      try {
        const { models } = await this.client.getAvailableModels(sessionId)
        setAvailableModels(models)
      } catch (err) {
        console.error('[client-manager] Failed to fetch available models:', err)
      }

      // Add to sessions list if not already there
      const { sessions } = sessionsListStore.state
      if (!sessions.some((s) => s.sessionId === sessionId)) {
        // Get the last user message as the title
        const lastUserMessage = [...messages]
          .reverse()
          .find((msg) => msg.role === 'user')

        let title: string | undefined
        if (lastUserMessage) {
          const textContent = lastUserMessage.content
            ?.filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join(' ')
          title = textContent?.substring(0, 100) || state.sessionName
        } else {
          title = state.sessionName
        }

        addSession({
          sessionId,
          title,
          messageCount: state.messageCount,
          createdAt: Date.now(),
        })
      }

      console.log(`[client-manager] Switched to session ${sessionId}`)
    } catch (err) {
      console.error('[client-manager] Failed to switch session:', err)
      throw err // Re-throw so restoreOrCreateSession can handle it
    }
  }
}

export const clientManager = new ClientManager()

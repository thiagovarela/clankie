/**
 * Client manager — singleton that manages the clankie client and updates stores.
 */

import { ClankieClient } from './clankie-client'
import type { AgentSessionEvent, AuthEvent, RpcResponse } from './types'
import { updateLoginFlow } from '@/stores/auth'
import { connectionStore, updateConnectionStatus } from '@/stores/connection'
import {
  appendStreamToken,
  appendThinkingToken,
  clearMessages,
  endAssistantMessage,
  endThinking,
  setMessages,
  startAssistantMessage,
  startThinking,
} from '@/stores/messages'
import {
  resetSession,
  setAvailableModels,
  setCompacting,
  setModel,
  setSessionId,
  setSessionName,
  setStreaming,
  setThinkingLevel,
  updateSessionState,
} from '@/stores/session'
import {
  addSession,
  clearSessions,
  sessionsListStore,
  setActiveSession,
  updateSessionMeta,
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
      onEvent: (sessionId, event) => this.handleEvent(sessionId, event),
      onAuthEvent: (event) => this.handleAuthEvent(event),
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

  private handleEvent(
    sessionId: string,
    event: AgentSessionEvent | RpcResponse,
  ): void {
    // Handle RPC responses (shouldn't normally reach here as they're handled by promises)
    if (event.type === 'response') {
      console.log('[client-manager] RPC response:', event)
      return
    }

    console.log(
      `[client-manager] Received event for session ${sessionId}:`,
      event.type,
      event,
    )

    const { activeSessionId } = sessionsListStore.state
    const isActiveSession = sessionId === activeSessionId

    if (
      event.type === 'model_changed' ||
      event.type === 'thinking_level_changed'
    ) {
      console.log('[client-manager] Event check:', {
        eventType: event.type,
        eventSessionId: sessionId,
        activeSessionId,
        isActiveSession,
      })
    }

    // Handle agent session events (pi-agent-core event protocol)
    switch (event.type) {
      // ─── Session events ────────────────────────────────────────────────
      case 'session_start':
        // Add new session to the list
        addSession({
          sessionId,
          title: undefined,
          messageCount: 0,
          createdAt: Date.now(),
        })

        // Set as active and update single-session store only if it's the active one
        if (isActiveSession) {
          setSessionId(sessionId)
        }
        break

      case 'session_name_changed':
        // Update single-session store only if active
        if (isActiveSession) {
          setSessionName(event.name)
        }
        break

      case 'model_changed':
        console.log('[client-manager] model_changed event:', {
          sessionId,
          isActiveSession,
          model: event.model,
        })
        // Update single-session store only if active
        if (isActiveSession) {
          setModel(event.model)
        }
        break

      case 'thinking_level_changed':
        if (isActiveSession) {
          setThinkingLevel(event.level)
        }
        break

      case 'state_update':
        // Update message count in session list
        updateSessionMeta(sessionId, {
          messageCount: event.state.messageCount,
        })

        if (isActiveSession) {
          updateSessionState(event.state)
        }
        break

      // ─── Agent lifecycle ───────────────────────────────────────────────
      case 'agent_start':
        if (isActiveSession) {
          setStreaming(true)
        }
        break

      case 'agent_end':
        if (isActiveSession) {
          setStreaming(false)
        }
        break

      // ─── Message streaming ─────────────────────────────────────────────
      case 'message_start':
        if (isActiveSession && event.message?.role === 'assistant') {
          startAssistantMessage()
        }
        break

      case 'message_update': {
        if (!isActiveSession) break

        const ame = event.assistantMessageEvent

        switch (ame.type) {
          case 'text_delta':
            // Use the accumulated text from the partial assistant message
            appendStreamToken(
              ame.partial?.content
                ?.filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('') ?? '',
            )
            break

          case 'thinking_start':
            startThinking()
            break

          case 'thinking_delta':
            appendThinkingToken(
              ame.partial?.content
                ?.filter((c: any) => c.type === 'thinking')
                .map((c: any) => c.thinking)
                .join('') ?? '',
            )
            break

          case 'thinking_end':
            endThinking()
            break
        }
        break
      }

      case 'message_end':
        if (isActiveSession) {
          if (event.message?.role === 'assistant') {
            endAssistantMessage()
          } else if (event.message?.role === 'user') {
            // Update session title with the latest user message
            const textContent = event.message.content
              ?.filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join(' ')
            if (textContent) {
              const title = textContent.substring(0, 100)
              updateSessionMeta(sessionId, { title })
            }
          }
        }
        break

      // ─── Turn lifecycle ────────────────────────────────────────────────
      case 'turn_start':
      case 'turn_end':
        break

      // ─── Tool execution ────────────────────────────────────────────────
      case 'tool_execution_start':
        if (isActiveSession) {
          console.log('[client-manager] Tool execution:', event.toolName)
        }
        break

      case 'tool_execution_update':
        break

      case 'tool_execution_end':
        break

      // ─── Compaction ────────────────────────────────────────────────────
      case 'compact_start':
      case 'auto_compaction_start':
        if (isActiveSession) {
          setCompacting(true)
        }
        break

      case 'compact_end':
      case 'auto_compaction_end':
        if (isActiveSession) {
          setCompacting(false)
        }
        break

      // ─── Errors ────────────────────────────────────────────────────────
      case 'error':
        console.error('[client-manager] Agent error:', event.error)
        break

      default:
        console.log('[client-manager] Unhandled event:', event)
    }
  }

  private handleAuthEvent(event: AuthEvent): void {
    console.log('[client-manager] Auth event:', event)
    updateLoginFlow(event)
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

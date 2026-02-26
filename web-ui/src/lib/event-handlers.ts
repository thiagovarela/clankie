/**
 * Event handlers — pure functions that map WebSocket events to store actions.
 * Extracted from ClientManager for testability.
 */

import type { AgentSessionEvent, AuthEvent, RpcResponse } from '@/lib/types'
import { updateLoginFlow } from '@/stores/auth'
import {
  finishToolExecution,
  registerToolCall,
  startToolExecution,
  updateToolExecution,
} from '@/stores/tool-executions'
import {
  appendStreamToken,
  appendThinkingToken,
  endAssistantMessage,
  endThinking,
  startAssistantMessage,
  startThinking,
} from '@/stores/messages'
import {
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
  touchSessionActivity,
  updateSessionMeta,
} from '@/stores/sessions-list'

/**
 * Handle session events from the WebSocket.
 * Dispatches to appropriate store actions based on event type and active session.
 */
export function handleSessionEvent(
  sessionId: string,
  event: AgentSessionEvent | RpcResponse,
  activeSessionId: string | null,
): void {
  // Handle RPC responses (shouldn't normally reach here as they're handled by promises)
  if (event.type === 'response') {
    console.log('[event-handlers] RPC response:', event)
    return
  }

  console.log(
    `[event-handlers] Received event for session ${sessionId}:`,
    event.type,
    event,
  )

  const isActiveSession = sessionId === activeSessionId

  if (
    event.type === 'model_changed' ||
    event.type === 'thinking_level_changed'
  ) {
    console.log('[event-handlers] Event check:', {
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
      console.log('[event-handlers] model_changed event:', {
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

        case 'toolcall_end': {
          const toolCall = ame.toolCall as
            | {
                id?: string
                toolCallId?: string
                name?: string
                toolName?: string
                arguments?: unknown
                input?: unknown
              }
            | undefined

          const toolCallId = toolCall?.id ?? toolCall?.toolCallId
          const toolName = toolCall?.name ?? toolCall?.toolName
          const args =
            (toolCall?.arguments as Record<string, unknown> | undefined) ??
            (toolCall?.input as Record<string, unknown> | undefined) ??
            {}

          if (toolCallId && toolName) {
            registerToolCall({
              toolCallId,
              toolName,
              args,
            })
          }
          break
        }
      }
      break
    }

    case 'message_end':
      // Update session activity timestamp for any message (user or assistant)
      touchSessionActivity(sessionId)

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
        startToolExecution({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args ?? {},
        })
      }
      break

    case 'tool_execution_update':
      if (isActiveSession) {
        updateToolExecution(event.toolCallId, event.partialResult ?? {})
      }
      break

    case 'tool_execution_end':
      if (isActiveSession) {
        finishToolExecution({
          toolCallId: event.toolCallId,
          result: event.result ?? {},
          isError: event.isError,
        })
      }
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
      console.error('[event-handlers] Agent error:', event.error)
      break

    default:
      console.log('[event-handlers] Unhandled event:', event)
  }
}

/**
 * Handle auth events from the WebSocket.
 * Updates the auth store's login flow state.
 */
export function handleAuthEvent(event: AuthEvent): void {
  console.log('[event-handlers] Auth event:', event)
  updateLoginFlow(event)
}

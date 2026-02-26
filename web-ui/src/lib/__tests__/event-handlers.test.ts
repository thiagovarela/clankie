/**
 * Tests for event-handlers.ts — the core event→store mapping logic.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { handleAuthEvent, handleSessionEvent } from '../event-handlers'
import {
  makeAgentEndEvent,
  makeAgentStartEvent,
  makeAuthCompleteEvent,
  makeAuthProgressEvent,
  makeAuthPromptEvent,
  makeAuthUrlEvent,
  makeCompactEndEvent,
  makeCompactStartEvent,
  makeMessageEndEvent,
  makeMessageStartEvent,
  makeMessageUpdateEvent,
  makeModelChangedEvent,
  makeModelInfo,
  makeSessionStartEvent,
  makeStateUpdateEvent,
  makeThinkingEndEvent,
  makeThinkingLevelChangedEvent,
  makeThinkingStartEvent,
} from '@/test/fixtures'
import { resetAllStores } from '@/test/setup'
import { authStore, startLoginFlow } from '@/stores/auth'
import { messagesStore } from '@/stores/messages'
import { sessionStore } from '@/stores/session'
import { sessionsListStore, setActiveSession } from '@/stores/sessions-list'

describe('handleSessionEvent', () => {
  beforeEach(() => {
    resetAllStores()
  })

  describe('agent lifecycle events', () => {
    it('agent_start sets isStreaming to true (active session)', () => {
      setActiveSession('session-1')

      handleSessionEvent('session-1', makeAgentStartEvent(), 'session-1')

      expect(sessionStore.state.isStreaming).toBe(true)
    })

    it('agent_start does nothing for inactive session', () => {
      setActiveSession('session-1')

      handleSessionEvent('session-2', makeAgentStartEvent(), 'session-1')

      expect(sessionStore.state.isStreaming).toBe(false)
    })

    it('agent_end sets isStreaming to false (active session)', () => {
      setActiveSession('session-1')
      // First set streaming to true
      handleSessionEvent('session-1', makeAgentStartEvent(), 'session-1')

      handleSessionEvent('session-1', makeAgentEndEvent(), 'session-1')

      expect(sessionStore.state.isStreaming).toBe(false)
    })

    it('agent_end does nothing for inactive session', () => {
      setActiveSession('session-1')
      handleSessionEvent('session-1', makeAgentStartEvent(), 'session-1')

      handleSessionEvent('session-2', makeAgentEndEvent(), 'session-1')

      expect(sessionStore.state.isStreaming).toBe(true)
    })
  })

  describe('message streaming events', () => {
    it('message_start creates a new assistant message (active session)', () => {
      setActiveSession('session-1')

      handleSessionEvent(
        'session-1',
        makeMessageStartEvent('assistant'),
        'session-1',
      )

      const messages = messagesStore.state.messages
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('assistant')
      expect(messages[0].isStreaming).toBe(true)
      expect(messagesStore.state.currentMessageId).toBeTruthy()
    })

    it('message_start does nothing for user messages', () => {
      setActiveSession('session-1')

      handleSessionEvent(
        'session-1',
        makeMessageStartEvent('user'),
        'session-1',
      )

      expect(messagesStore.state.messages).toHaveLength(0)
    })

    it('message_update with text_delta accumulates content', () => {
      setActiveSession('session-1')
      handleSessionEvent(
        'session-1',
        makeMessageStartEvent('assistant'),
        'session-1',
      )

      handleSessionEvent(
        'session-1',
        makeMessageUpdateEvent('Hello', 'text_delta'),
        'session-1',
      )
      handleSessionEvent(
        'session-1',
        makeMessageUpdateEvent('Hello world', 'text_delta'),
        'session-1',
      )

      const messages = messagesStore.state.messages
      expect(messages[0].content).toBe('Hello world')
      expect(messages[0].isStreaming).toBe(true)
    })

    it('thinking lifecycle: start → delta → end', () => {
      setActiveSession('session-1')
      handleSessionEvent(
        'session-1',
        makeMessageStartEvent('assistant'),
        'session-1',
      )

      // Start thinking
      handleSessionEvent('session-1', makeThinkingStartEvent(), 'session-1')
      expect(messagesStore.state.messages[0].isThinking).toBe(true)

      // Delta thinking
      handleSessionEvent(
        'session-1',
        makeMessageUpdateEvent('Thinking...', 'thinking_delta'),
        'session-1',
      )
      expect(messagesStore.state.messages[0].thinkingContent).toBe(
        'Thinking...',
      )

      // End thinking
      handleSessionEvent('session-1', makeThinkingEndEvent(), 'session-1')
      expect(messagesStore.state.messages[0].isThinking).toBe(false)
    })

    it('message_end for assistant clears streaming flags', () => {
      setActiveSession('session-1')
      handleSessionEvent(
        'session-1',
        makeMessageStartEvent('assistant'),
        'session-1',
      )
      handleSessionEvent(
        'session-1',
        makeMessageUpdateEvent('Hello', 'text_delta'),
        'session-1',
      )

      handleSessionEvent(
        'session-1',
        makeMessageEndEvent('assistant', 'Hello'),
        'session-1',
      )

      expect(messagesStore.state.messages[0].isStreaming).toBe(false)
      expect(messagesStore.state.currentMessageId).toBeNull()
    })

    it('message_end for user updates session title', () => {
      const sessionId = 'session-1'
      setActiveSession(sessionId)
      handleSessionEvent(sessionId, makeSessionStartEvent(sessionId), sessionId)

      handleSessionEvent(
        sessionId,
        makeMessageEndEvent('user', 'What is the weather?'),
        sessionId,
      )

      const session = sessionsListStore.state.sessions.find(
        (s) => s.sessionId === sessionId,
      )
      expect(session?.title).toBe('What is the weather?')
    })

    it('message_end truncates long user messages to 100 chars', () => {
      const sessionId = 'session-1'
      setActiveSession(sessionId)
      handleSessionEvent(sessionId, makeSessionStartEvent(sessionId), sessionId)

      const longMessage = 'a'.repeat(150)
      handleSessionEvent(
        sessionId,
        makeMessageEndEvent('user', longMessage),
        sessionId,
      )

      const session = sessionsListStore.state.sessions.find(
        (s) => s.sessionId === sessionId,
      )
      expect(session?.title).toHaveLength(100)
      expect(session?.title).toBe('a'.repeat(100))
    })

    it('message events do nothing for inactive session', () => {
      setActiveSession('session-1')

      handleSessionEvent(
        'session-2',
        makeMessageStartEvent('assistant'),
        'session-1',
      )
      handleSessionEvent(
        'session-2',
        makeMessageUpdateEvent('Hello', 'text_delta'),
        'session-1',
      )

      expect(messagesStore.state.messages).toHaveLength(0)
    })
  })

  describe('session events', () => {
    it('session_start adds session to list', () => {
      const sessionId = 'session-new'

      handleSessionEvent(sessionId, makeSessionStartEvent(sessionId), null)

      const sessions = sessionsListStore.state.sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].sessionId).toBe(sessionId)
      expect(sessions[0].messageCount).toBe(0)
    })

    it('session_start sets sessionId in store if active', () => {
      const sessionId = 'session-new'

      handleSessionEvent(sessionId, makeSessionStartEvent(sessionId), sessionId)

      expect(sessionStore.state.sessionId).toBe(sessionId)
    })

    it('model_changed updates model (active session)', () => {
      const newModel = makeModelInfo({ name: 'Claude 3 Opus', id: 'opus' })
      setActiveSession('session-1')

      handleSessionEvent(
        'session-1',
        makeModelChangedEvent(newModel),
        'session-1',
      )

      expect(sessionStore.state.model).toEqual(newModel)
    })

    it('model_changed ignores inactive session', () => {
      const newModel = makeModelInfo({ name: 'Claude 3 Opus' })
      setActiveSession('session-1')

      handleSessionEvent(
        'session-2',
        makeModelChangedEvent(newModel),
        'session-1',
      )

      expect(sessionStore.state.model).toBeNull()
    })

    it('thinking_level_changed updates level (active session)', () => {
      setActiveSession('session-1')

      handleSessionEvent(
        'session-1',
        makeThinkingLevelChangedEvent('extended'),
        'session-1',
      )

      expect(sessionStore.state.thinkingLevel).toBe('extended')
    })

    it('thinking_level_changed ignores inactive session', () => {
      setActiveSession('session-1')

      handleSessionEvent(
        'session-2',
        makeThinkingLevelChangedEvent('extended'),
        'session-1',
      )

      expect(sessionStore.state.thinkingLevel).toBe('normal') // default
    })

    it('state_update updates both session store and sessions list', () => {
      const sessionId = 'session-1'
      setActiveSession(sessionId)
      handleSessionEvent(sessionId, makeSessionStartEvent(sessionId), sessionId)

      handleSessionEvent(
        sessionId,
        makeStateUpdateEvent({ messageCount: 5, isStreaming: true }),
        sessionId,
      )

      // Check session store
      expect(sessionStore.state.messageCount).toBe(5)
      expect(sessionStore.state.isStreaming).toBe(true)

      // Check sessions list
      const session = sessionsListStore.state.sessions[0]
      expect(session.messageCount).toBe(5)
    })

    it('state_update only updates sessions list for inactive session', () => {
      const sessionId = 'session-2'
      setActiveSession('session-1')
      handleSessionEvent(
        sessionId,
        makeSessionStartEvent(sessionId),
        'session-1',
      )

      handleSessionEvent(
        sessionId,
        makeStateUpdateEvent({ messageCount: 10 }),
        'session-1',
      )

      // Session store not updated
      expect(sessionStore.state.messageCount).toBe(0)

      // Sessions list updated
      const session = sessionsListStore.state.sessions.find(
        (s) => s.sessionId === sessionId,
      )
      expect(session?.messageCount).toBe(10)
    })
  })

  describe('compaction events', () => {
    it('compact_start sets isCompacting to true (active session)', () => {
      setActiveSession('session-1')

      handleSessionEvent('session-1', makeCompactStartEvent(), 'session-1')

      expect(sessionStore.state.isCompacting).toBe(true)
    })

    it('compact_end sets isCompacting to false (active session)', () => {
      setActiveSession('session-1')
      handleSessionEvent('session-1', makeCompactStartEvent(), 'session-1')

      handleSessionEvent('session-1', makeCompactEndEvent(), 'session-1')

      expect(sessionStore.state.isCompacting).toBe(false)
    })

    it('compact events do nothing for inactive session', () => {
      setActiveSession('session-1')

      handleSessionEvent('session-2', makeCompactStartEvent(), 'session-1')

      expect(sessionStore.state.isCompacting).toBe(false)
    })
  })

  describe('RPC response events', () => {
    it('response event is ignored (handled elsewhere)', () => {
      const response = {
        type: 'response' as const,
        command: 'get_state',
        success: true,
        data: { foo: 'bar' },
      }

      // Should not throw
      handleSessionEvent('session-1', response, 'session-1')

      // Stores unchanged
      expect(sessionStore.state.sessionId).toBeNull()
    })
  })
})

describe('handleAuthEvent', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('url event transitions to waiting_url status', () => {
    const loginFlowId = 'flow-123'
    startLoginFlow(loginFlowId, 'anthropic')

    handleAuthEvent(
      makeAuthUrlEvent(loginFlowId, 'https://oauth.anthropic.com'),
    )

    const flow = authStore.state.loginFlow
    expect(flow?.status).toBe('waiting_url')
    expect(flow?.url).toBe('https://oauth.anthropic.com')
    expect(flow?.instructions).toBe('Click the link to authenticate')
  })

  it('prompt event transitions to waiting_input status', () => {
    const loginFlowId = 'flow-123'
    startLoginFlow(loginFlowId, 'anthropic')

    handleAuthEvent(makeAuthPromptEvent(loginFlowId, 'Enter your code'))

    const flow = authStore.state.loginFlow
    expect(flow?.status).toBe('waiting_input')
    expect(flow?.promptMessage).toBe('Enter your code')
  })

  it('progress event transitions to in_progress status', () => {
    const loginFlowId = 'flow-123'
    startLoginFlow(loginFlowId, 'anthropic')

    handleAuthEvent(makeAuthProgressEvent(loginFlowId, 'Verifying...'))

    const flow = authStore.state.loginFlow
    expect(flow?.status).toBe('in_progress')
    expect(flow?.progressMessage).toBe('Verifying...')
  })

  it('complete event with success transitions to complete status', () => {
    const loginFlowId = 'flow-123'
    startLoginFlow(loginFlowId, 'anthropic')

    handleAuthEvent(makeAuthCompleteEvent(loginFlowId, true))

    const flow = authStore.state.loginFlow
    expect(flow?.status).toBe('complete')
    expect(flow?.success).toBe(true)
  })

  it('complete event with error transitions to error status', () => {
    const loginFlowId = 'flow-123'
    startLoginFlow(loginFlowId, 'anthropic')

    handleAuthEvent(makeAuthCompleteEvent(loginFlowId, false, 'Invalid token'))

    const flow = authStore.state.loginFlow
    expect(flow?.status).toBe('error')
    expect(flow?.success).toBe(false)
    expect(flow?.error).toBe('Invalid token')
  })

  it('ignores events for wrong loginFlowId', () => {
    startLoginFlow('flow-123', 'anthropic')

    // Send event for different flow
    handleAuthEvent(makeAuthUrlEvent('flow-456', 'https://example.com'))

    const flow = authStore.state.loginFlow
    expect(flow?.status).toBe('idle') // unchanged
    expect(flow?.url).toBeUndefined()
  })

  it('handles event when no login flow is active', () => {
    // Should not throw
    handleAuthEvent(makeAuthUrlEvent('flow-123', 'https://example.com'))

    expect(authStore.state.loginFlow).toBeNull()
  })
})

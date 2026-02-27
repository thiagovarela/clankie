import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatMessages } from '@/components/chat-messages'
import { ConnectionStatus } from '@/components/connection-status'
import { handleSessionEvent } from '@/lib/event-handlers'
import { updateConnectionStatus } from '@/stores/connection'
import { messagesStore } from '@/stores/messages'
import { sessionStore } from '@/stores/session'
import { sessionsListStore, setActiveSession } from '@/stores/sessions-list'
import { makeModelInfo } from '@/test/fixtures'

describe('Event-to-Render Integration Tests', () => {
  describe('Full conversation turn', () => {
    it('processes agent_start → message_start → text_delta → message_end → agent_end', async () => {
      // Setup: Set active session
      setActiveSession('session-1')

      // 1. agent_start event
      handleSessionEvent('session-1', { type: 'agent_start' }, 'session-1')

      // Assert: isStreaming is true
      expect(sessionStore.state.isStreaming).toBe(true)

      // 2. message_start event
      handleSessionEvent(
        'session-1',
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        },
        'session-1',
      )

      // Assert: New message in store
      expect(messagesStore.state.messages).toHaveLength(1)
      expect(messagesStore.state.messages[0].role).toBe('assistant')
      expect(messagesStore.state.messages[0].isStreaming).toBe(true)

      // 3. text_delta events (simulating streaming)
      handleSessionEvent(
        'session-1',
        {
          type: 'message_update',
          message: { role: 'assistant', content: [] },
          assistantMessageEvent: {
            type: 'text_delta',
            contentIndex: 0,
            delta: 'Hello',
            partial: {
              content: [{ type: 'text', text: 'Hello' }],
            },
          },
        },
        'session-1',
      )

      // Assert: Store updated with partial content
      expect(messagesStore.state.messages[0].content).toBe('Hello')

      // Render and check DOM
      render(<ChatMessages />)
      expect(screen.getByText('Hello')).toBeInTheDocument()

      // Continue streaming
      handleSessionEvent(
        'session-1',
        {
          type: 'message_update',
          message: { role: 'assistant', content: [] },
          assistantMessageEvent: {
            type: 'text_delta',
            contentIndex: 0,
            delta: ' world',
            partial: {
              content: [{ type: 'text', text: 'Hello world' }],
            },
          },
        },
        'session-1',
      )

      // Assert: Store updated with full content
      expect(messagesStore.state.messages[0].content).toBe('Hello world')

      // 4. message_end event
      handleSessionEvent(
        'session-1',
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello world' }],
          },
        },
        'session-1',
      )

      // Assert: Message streaming ended
      expect(messagesStore.state.messages[0].isStreaming).toBe(false)

      // 5. agent_end event
      handleSessionEvent(
        'session-1',
        { type: 'agent_end', messages: [] },
        'session-1',
      )

      // Assert: isStreaming is false
      expect(sessionStore.state.isStreaming).toBe(false)
    })
  })

  describe('Thinking flow', () => {
    it('shows thinking indicator during thinking phase', () => {
      setActiveSession('session-1')

      // Start assistant message
      handleSessionEvent(
        'session-1',
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        },
        'session-1',
      )

      // thinking_start
      handleSessionEvent(
        'session-1',
        {
          type: 'message_update',
          message: { role: 'assistant', content: [] },
          assistantMessageEvent: {
            type: 'thinking_start',
            contentIndex: 0,
            partial: {},
          },
        },
        'session-1',
      )

      // Assert: isThinking flag set
      expect(messagesStore.state.messages[0].isThinking).toBe(true)

      // thinking_delta
      handleSessionEvent(
        'session-1',
        {
          type: 'message_update',
          message: { role: 'assistant', content: [] },
          assistantMessageEvent: {
            type: 'thinking_delta',
            contentIndex: 0,
            delta: 'Let me think',
            partial: {
              content: [
                { type: 'thinking', thinking: 'Let me think about this' },
              ],
            },
          },
        },
        'session-1',
      )

      // Assert: Thinking content in store
      expect(messagesStore.state.messages[0].thinkingContent).toBe(
        'Let me think about this',
      )

      // Render and verify DOM (metadata collapsed by default)
      render(<ChatMessages />)
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: /assistant response/i }),
      )
      expect(screen.getByText('Thinking...')).toBeInTheDocument()
      expect(screen.getByText('Let me think about this')).toBeInTheDocument()

      // thinking_end
      handleSessionEvent(
        'session-1',
        {
          type: 'message_update',
          message: { role: 'assistant', content: [] },
          assistantMessageEvent: {
            type: 'thinking_end',
            contentIndex: 0,
            content: 'Done',
            partial: {},
          },
        },
        'session-1',
      )

      // Assert: isThinking flag cleared
      expect(messagesStore.state.messages[0].isThinking).toBe(false)

      // Now add text content
      handleSessionEvent(
        'session-1',
        {
          type: 'message_update',
          message: { role: 'assistant', content: [] },
          assistantMessageEvent: {
            type: 'text_delta',
            contentIndex: 1,
            delta: 'Answer',
            partial: {
              content: [{ type: 'text', text: "Here's my answer" }],
            },
          },
        },
        'session-1',
      )

      // Assert: Text content in store
      expect(messagesStore.state.messages[0].content).toBe("Here's my answer")
    })
  })

  describe('Model change event', () => {
    it('updates session store when model changes', () => {
      setActiveSession('session-1')

      const newModel = makeModelInfo({
        provider: 'openai',
        id: 'gpt-4',
        name: 'GPT-4',
      })

      // Send model_changed event
      handleSessionEvent(
        'session-1',
        {
          type: 'model_changed',
          model: newModel,
        },
        'session-1',
      )

      // Assert: Model updated in store
      expect(sessionStore.state.model).toEqual(newModel)
    })

    it('ignores model change for non-active session', () => {
      setActiveSession('session-2')

      const originalModel = sessionStore.state.model
      const newModel = makeModelInfo({
        provider: 'openai',
        id: 'gpt-4',
        name: 'GPT-4',
      })

      // Send model_changed event for session-1 (not active)
      handleSessionEvent(
        'session-1',
        {
          type: 'model_changed',
          model: newModel,
        },
        'session-2',
      )

      // Assert: Model unchanged
      expect(sessionStore.state.model).toEqual(originalModel)
    })
  })

  describe('Session lifecycle', () => {
    it('session_start adds to sessions list and renders in sidebar', () => {
      // Send session_start event
      handleSessionEvent(
        'session-1',
        {
          type: 'session_start',
          sessionId: 'session-1',
        },
        null,
      )

      // Assert: Session added to list
      const { sessions } = sessionsListStore.state
      expect(sessions).toHaveLength(1)
      expect(sessions[0]).toMatchObject({
        sessionId: 'session-1',
        messageCount: 0,
      })
    })

    it('message_end for user message updates session title', () => {
      // First add the session
      handleSessionEvent(
        'session-1',
        {
          type: 'session_start',
          sessionId: 'session-1',
        },
        'session-1',
      )

      // Send message_end with user message
      handleSessionEvent(
        'session-1',
        {
          type: 'message_end',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'What is the weather?' }],
          },
        },
        'session-1',
      )

      // Assert: Session title updated
      const { sessions } = sessionsListStore.state
      expect(sessions[0].title).toBe('What is the weather?')
    })
  })

  describe('Connection status rendering', () => {
    it('updates ConnectionStatus component when status changes', () => {
      updateConnectionStatus('disconnected')

      const { rerender } = render(<ConnectionStatus />)
      expect(screen.getByText('Disconnected')).toBeInTheDocument()

      // Change to connecting
      updateConnectionStatus('connecting')
      rerender(<ConnectionStatus />)
      expect(screen.getByText('Connecting...')).toBeInTheDocument()

      // Change to connected
      updateConnectionStatus('connected')
      rerender(<ConnectionStatus />)
      expect(screen.getByText('Connected')).toBeInTheDocument()

      // Change to error
      updateConnectionStatus('error', 'Connection failed')
      rerender(<ConnectionStatus />)
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })
  })

  describe('Active session gating', () => {
    it('only updates stores for active session events', () => {
      // Set session-2 as active
      setActiveSession('session-2')

      // Send agent_start for session-1 (not active)
      handleSessionEvent('session-1', { type: 'agent_start' }, 'session-2')

      // Assert: isStreaming still false
      expect(sessionStore.state.isStreaming).toBe(false)

      // Send agent_start for session-2 (active)
      handleSessionEvent('session-2', { type: 'agent_start' }, 'session-2')

      // Assert: isStreaming now true
      expect(sessionStore.state.isStreaming).toBe(true)
    })

    it('does not render messages from non-active session', () => {
      setActiveSession('session-1')

      render(<ChatMessages />)

      // Send message for session-2 (not active)
      handleSessionEvent(
        'session-2',
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        },
        'session-1',
      )

      // Assert: No message in store
      expect(messagesStore.state.messages).toHaveLength(0)

      // Send message for session-1 (active)
      handleSessionEvent(
        'session-1',
        {
          type: 'message_start',
          message: { role: 'assistant', content: [] },
        },
        'session-1',
      )

      // Assert: Message now in store
      expect(messagesStore.state.messages).toHaveLength(1)
    })
  })

  describe('Compaction events', () => {
    it('sets isCompacting flag and can render during compaction', () => {
      setActiveSession('session-1')

      // Send compact_start
      handleSessionEvent('session-1', { type: 'compact_start' }, 'session-1')

      // Assert: isCompacting is true
      expect(sessionStore.state.isCompacting).toBe(true)

      // Send compact_end
      handleSessionEvent(
        'session-1',
        {
          type: 'compact_end',
          originalCount: 100,
          compactedCount: 50,
        },
        'session-1',
      )

      // Assert: isCompacting is false
      expect(sessionStore.state.isCompacting).toBe(false)
    })
  })
})

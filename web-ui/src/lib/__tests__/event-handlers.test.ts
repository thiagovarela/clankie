import { describe, expect, it, vi } from 'vitest'
import { handleAuthEvent, handleSessionEvent } from '../event-handlers'
import { authStore } from '@/stores/auth'
import { messagesStore } from '@/stores/messages'
import { sessionStore } from '@/stores/session'
import { sessionsListStore } from '@/stores/sessions-list'
import {
  makeAgentEndEvent,
  makeAgentStartEvent,
  makeAuthEventComplete,
  makeAuthEventPrompt,
  makeAuthEventUrl,
  makeCompactEndEvent,
  makeCompactStartEvent,
  makeMessageEndEvent,
  makeMessageStartEvent,
  makeModelChangedEvent,
  makeModelInfo,
  makeSessionNameChangedEvent,
  makeSessionStartEvent,
  makeSessionState,
  makeStateUpdateEvent,
  makeThinkingLevelChangedEvent,
} from '@/test/fixtures'

describe('event-handlers', () => {
  describe('handleSessionEvent', () => {
    describe('session lifecycle events', () => {
      it('session_start adds session to list', () => {
        handleSessionEvent(
          'session-1',
          makeSessionStartEvent('session-1'),
          null,
        )

        const { sessions } = sessionsListStore.state
        expect(sessions).toHaveLength(1)
        expect(sessions[0]).toMatchObject({
          sessionId: 'session-1',
          title: undefined,
          messageCount: 0,
        })
      })

      it('session_start sets sessionId in session store if active', () => {
        handleSessionEvent(
          'session-1',
          makeSessionStartEvent('session-1'),
          'session-1',
        )

        expect(sessionStore.state.sessionId).toBe('session-1')
      })

      it('session_start does not set sessionId if not active', () => {
        handleSessionEvent(
          'session-1',
          makeSessionStartEvent('session-1'),
          'session-2',
        )

        expect(sessionStore.state.sessionId).toBeNull()
      })

      it('session_name_changed updates session store if active', () => {
        handleSessionEvent(
          'session-1',
          makeSessionNameChangedEvent('My Session'),
          'session-1',
        )

        expect(sessionStore.state.sessionName).toBe('My Session')
      })

      it('session_name_changed does nothing if not active', () => {
        handleSessionEvent(
          'session-1',
          makeSessionNameChangedEvent('My Session'),
          'session-2',
        )

        expect(sessionStore.state.sessionName).toBeUndefined()
      })

      it('model_changed updates model if active', () => {
        const model = makeModelInfo({ name: 'Claude 3.5 Sonnet' })
        handleSessionEvent(
          'session-1',
          makeModelChangedEvent(model),
          'session-1',
        )

        expect(sessionStore.state.model).toEqual(model)
      })

      it('model_changed does nothing if not active', () => {
        const model = makeModelInfo({ name: 'Claude 3.5 Sonnet' })
        handleSessionEvent(
          'session-1',
          makeModelChangedEvent(model),
          'session-2',
        )

        expect(sessionStore.state.model).toBeNull()
      })

      it('thinking_level_changed updates level if active', () => {
        handleSessionEvent(
          'session-1',
          makeThinkingLevelChangedEvent('high'),
          'session-1',
        )

        expect(sessionStore.state.thinkingLevel).toBe('high')
      })

      it('thinking_level_changed does nothing if not active', () => {
        handleSessionEvent(
          'session-1',
          makeThinkingLevelChangedEvent('high'),
          'session-2',
        )

        expect(sessionStore.state.thinkingLevel).toBe('medium') // default
      })

      it('state_update updates message count in sessions list', () => {
        // First add the session
        handleSessionEvent(
          'session-1',
          makeSessionStartEvent('session-1'),
          null,
        )

        const state = makeSessionState({ messageCount: 10 })
        handleSessionEvent(
          'session-1',
          makeStateUpdateEvent(state),
          'session-1',
        )

        const { sessions } = sessionsListStore.state
        expect(sessions[0].messageCount).toBe(10)
      })

      it('state_update updates session store if active', () => {
        const state = makeSessionState({
          thinkingLevel: 'xhigh',
          messageCount: 5,
        })
        handleSessionEvent(
          'session-1',
          makeStateUpdateEvent(state),
          'session-1',
        )

        expect(sessionStore.state).toMatchObject({
          thinkingLevel: 'xhigh',
          messageCount: 5,
        })
      })

      it('state_update does not update session store if not active', () => {
        const state = makeSessionState({ thinkingLevel: 'xhigh' })
        handleSessionEvent(
          'session-1',
          makeStateUpdateEvent(state),
          'session-2',
        )

        expect(sessionStore.state.thinkingLevel).toBe('medium') // default
      })
    })

    describe('agent lifecycle events', () => {
      it('agent_start sets isStreaming to true if active', () => {
        handleSessionEvent('session-1', makeAgentStartEvent(), 'session-1')

        expect(sessionStore.state.isStreaming).toBe(true)
      })

      it('agent_start does nothing if not active', () => {
        handleSessionEvent('session-1', makeAgentStartEvent(), 'session-2')

        expect(sessionStore.state.isStreaming).toBe(false)
      })

      it('agent_end sets isStreaming to false if active', () => {
        // First set streaming
        handleSessionEvent('session-1', makeAgentStartEvent(), 'session-1')
        handleSessionEvent('session-1', makeAgentEndEvent(), 'session-1')

        expect(sessionStore.state.isStreaming).toBe(false)
      })

      it('agent_end does nothing if not active', () => {
        handleSessionEvent('session-1', makeAgentStartEvent(), 'session-1')
        handleSessionEvent('session-1', makeAgentEndEvent(), 'session-2')

        expect(sessionStore.state.isStreaming).toBe(true) // Still true
      })
    })

    describe('message streaming events', () => {
      it('message_start creates assistant message if active', () => {
        const message = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(message),
          'session-1',
        )

        const { messages } = messagesStore.state
        expect(messages).toHaveLength(1)
        expect(messages[0].role).toBe('assistant')
      })

      it('message_start does nothing for user messages', () => {
        const message = { role: 'user' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(message),
          'session-1',
        )

        const { messages } = messagesStore.state
        expect(messages).toHaveLength(0)
      })

      it('message_start does nothing if not active', () => {
        const message = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(message),
          'session-2',
        )

        const { messages } = messagesStore.state
        expect(messages).toHaveLength(0)
      })

      it('message_update with text_delta appends content if active', () => {
        // Start a message first
        const startMsg = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(startMsg),
          'session-1',
        )

        // Send text_delta
        handleSessionEvent(
          'session-1',
          {
            type: 'message_update',
            message: startMsg,
            assistantMessageEvent: {
              type: 'text_delta',
              contentIndex: 0,
              delta: 'Hello',
              partial: {
                content: [{ type: 'text', text: 'Hello world' }],
              },
            },
          },
          'session-1',
        )

        const { messages } = messagesStore.state
        expect(messages[0].content).toBe('Hello world')
      })

      it('message_update with thinking_start/delta/end updates thinking state if active', () => {
        // Start a message
        const startMsg = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(startMsg),
          'session-1',
        )

        // thinking_start
        handleSessionEvent(
          'session-1',
          {
            type: 'message_update',
            message: startMsg,
            assistantMessageEvent: {
              type: 'thinking_start',
              contentIndex: 0,
              partial: {},
            },
          },
          'session-1',
        )

        let { messages } = messagesStore.state
        expect(messages[0].isThinking).toBe(true)

        // thinking_delta
        handleSessionEvent(
          'session-1',
          {
            type: 'message_update',
            message: startMsg,
            assistantMessageEvent: {
              type: 'thinking_delta',
              contentIndex: 0,
              delta: 'Hmm',
              partial: {
                content: [{ type: 'thinking', thinking: 'Hmm, let me think' }],
              },
            },
          },
          'session-1',
        )

        messages = messagesStore.state.messages
        expect(messages[0].thinkingContent).toBe('Hmm, let me think')

        // thinking_end
        handleSessionEvent(
          'session-1',
          {
            type: 'message_update',
            message: startMsg,
            assistantMessageEvent: {
              type: 'thinking_end',
              contentIndex: 0,
              content: 'Done thinking',
              partial: {},
            },
          },
          'session-1',
        )

        messages = messagesStore.state.messages
        expect(messages[0].isThinking).toBe(false)
      })

      it('message_update does nothing if not active', () => {
        // Start a message on session-1
        const startMsg = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(startMsg),
          'session-1',
        )

        // Send update for session-1 but session-2 is active
        handleSessionEvent(
          'session-1',
          {
            type: 'message_update',
            message: startMsg,
            assistantMessageEvent: {
              type: 'text_delta',
              contentIndex: 0,
              delta: 'Hello',
              partial: {
                content: [{ type: 'text', text: 'Hello world' }],
              },
            },
          },
          'session-2',
        )

        const { messages } = messagesStore.state
        expect(messages[0].content).toBe('') // Not updated
      })

      it('message_end for assistant ends streaming if active', () => {
        // Start and stream a message
        const startMsg = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(startMsg),
          'session-1',
        )
        handleSessionEvent(
          'session-1',
          {
            type: 'message_update',
            message: startMsg,
            assistantMessageEvent: {
              type: 'text_delta',
              contentIndex: 0,
              delta: 'Done',
              partial: { content: [{ type: 'text', text: 'Done' }] },
            },
          },
          'session-1',
        )

        const endMsg = {
          role: 'assistant' as const,
          content: [{ type: 'text', text: 'Done' }],
        }
        handleSessionEvent(
          'session-1',
          makeMessageEndEvent(endMsg),
          'session-1',
        )

        const { messages } = messagesStore.state
        expect(messages[0].isStreaming).toBe(false)
      })

      it('message_end for user updates session title if active', () => {
        // Add session first
        handleSessionEvent(
          'session-1',
          makeSessionStartEvent('session-1'),
          'session-1',
        )

        const userMsg = {
          role: 'user' as const,
          content: [{ type: 'text', text: 'What is the meaning of life?' }],
        }
        handleSessionEvent(
          'session-1',
          makeMessageEndEvent(userMsg),
          'session-1',
        )

        const { sessions } = sessionsListStore.state
        expect(sessions[0].title).toBe('What is the meaning of life?')
      })

      it('message_end for user truncates title to 100 chars', () => {
        // Add session first
        handleSessionEvent(
          'session-1',
          makeSessionStartEvent('session-1'),
          'session-1',
        )

        const longText = 'a'.repeat(150)
        const userMsg = {
          role: 'user' as const,
          content: [{ type: 'text', text: longText }],
        }
        handleSessionEvent(
          'session-1',
          makeMessageEndEvent(userMsg),
          'session-1',
        )

        const { sessions } = sessionsListStore.state
        expect(sessions[0].title).toBe('a'.repeat(100))
      })

      it('message_end does nothing if not active', () => {
        // Start a message
        const startMsg = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageStartEvent(startMsg),
          'session-1',
        )

        // End message on different session
        const endMsg = { role: 'assistant' as const, content: [] }
        handleSessionEvent(
          'session-1',
          makeMessageEndEvent(endMsg),
          'session-2',
        )

        const { messages } = messagesStore.state
        expect(messages[0].isStreaming).toBe(true) // Still streaming
      })
    })

    describe('compaction events', () => {
      it('compact_start sets isCompacting to true if active', () => {
        handleSessionEvent('session-1', makeCompactStartEvent(), 'session-1')

        expect(sessionStore.state.isCompacting).toBe(true)
      })

      it('auto_compaction_start sets isCompacting to true if active', () => {
        handleSessionEvent(
          'session-1',
          { type: 'auto_compaction_start', reason: 'too many messages' },
          'session-1',
        )

        expect(sessionStore.state.isCompacting).toBe(true)
      })

      it('compact_end sets isCompacting to false if active', () => {
        handleSessionEvent('session-1', makeCompactStartEvent(), 'session-1')
        handleSessionEvent(
          'session-1',
          makeCompactEndEvent(100, 50),
          'session-1',
        )

        expect(sessionStore.state.isCompacting).toBe(false)
      })

      it('auto_compaction_end sets isCompacting to false if active', () => {
        handleSessionEvent(
          'session-1',
          { type: 'auto_compaction_start', reason: 'too many messages' },
          'session-1',
        )
        handleSessionEvent(
          'session-1',
          {
            type: 'auto_compaction_end',
            result: {},
            aborted: false,
            willRetry: false,
          },
          'session-1',
        )

        expect(sessionStore.state.isCompacting).toBe(false)
      })

      it('compaction events do nothing if not active', () => {
        handleSessionEvent('session-1', makeCompactStartEvent(), 'session-2')

        expect(sessionStore.state.isCompacting).toBe(false)
      })
    })

    describe('RPC response events', () => {
      it('response events are logged and ignored', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        handleSessionEvent(
          'session-1',
          {
            type: 'response',
            command: 'test',
            success: true,
            data: {},
          },
          'session-1',
        )

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('RPC response'),
          expect.any(Object),
        )

        // No store changes
        expect(sessionStore.state.sessionId).toBeNull()

        consoleSpy.mockRestore()
      })
    })

    describe('unhandled events', () => {
      it('turn_start and turn_end do nothing', () => {
        handleSessionEvent('session-1', { type: 'turn_start' }, 'session-1')
        handleSessionEvent(
          'session-1',
          { type: 'turn_end', message: {}, toolResults: [] },
          'session-1',
        )

        // No errors, no state changes
        expect(sessionStore.state.sessionId).toBeNull()
      })

      it('tool_execution events are tracked if active', () => {
        handleSessionEvent(
          'session-1',
          {
            type: 'tool_execution_start',
            toolCallId: '1',
            toolName: 'bash',
            args: {},
          },
          'session-1',
        )

        handleSessionEvent(
          'session-1',
          {
            type: 'tool_execution_end',
            toolCallId: '1',
            toolName: 'bash',
            result: {},
            isError: false,
          },
          'session-1',
        )

        // No throw means handler processed both lifecycle events
        expect(true).toBe(true)
      })

      it('error events are logged', () => {
        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {})

        handleSessionEvent(
          'session-1',
          { type: 'error', error: 'Something went wrong' },
          'session-1',
        )

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Agent error'),
          'Something went wrong',
        )

        consoleSpy.mockRestore()
      })
    })
  })

  describe('handleAuthEvent', () => {
    it('url event updates login flow', () => {
      // Start a login flow first
      authStore.setState(() => ({
        providers: [],
        isLoadingProviders: false,
        loginFlow: {
          loginFlowId: 'flow-1',
          providerId: 'anthropic',
          status: 'idle',
        },
      }))

      handleAuthEvent(
        makeAuthEventUrl('flow-1', 'https://auth.example.com', 'Sign in'),
      )

      expect(authStore.state.loginFlow).toMatchObject({
        status: 'waiting_url',
        url: 'https://auth.example.com',
        instructions: 'Sign in',
      })
    })

    it('prompt event updates login flow', () => {
      authStore.setState(() => ({
        providers: [],
        isLoadingProviders: false,
        loginFlow: {
          loginFlowId: 'flow-1',
          providerId: 'anthropic',
          status: 'idle',
        },
      }))

      handleAuthEvent(makeAuthEventPrompt('flow-1', 'Enter code', 'Code'))

      expect(authStore.state.loginFlow).toMatchObject({
        status: 'waiting_input',
        promptMessage: 'Enter code',
        promptPlaceholder: 'Code',
      })
    })

    it('complete event updates login flow', () => {
      authStore.setState(() => ({
        providers: [],
        isLoadingProviders: false,
        loginFlow: {
          loginFlowId: 'flow-1',
          providerId: 'anthropic',
          status: 'in_progress',
        },
      }))

      handleAuthEvent(makeAuthEventComplete('flow-1', true))

      expect(authStore.state.loginFlow).toMatchObject({
        status: 'complete',
        success: true,
      })
    })

    it('ignores events for wrong loginFlowId', () => {
      authStore.setState(() => ({
        providers: [],
        isLoadingProviders: false,
        loginFlow: {
          loginFlowId: 'flow-1',
          providerId: 'anthropic',
          status: 'idle',
        },
      }))

      const initialFlow = authStore.state.loginFlow
      handleAuthEvent(makeAuthEventUrl('flow-2', 'https://wrong.com'))

      expect(authStore.state.loginFlow).toEqual(initialFlow)
    })
  })
})

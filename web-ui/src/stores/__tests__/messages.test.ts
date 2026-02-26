import { describe, expect, it } from 'vitest'
import {
  addUserMessage,
  appendStreamToken,
  appendThinkingToken,
  clearMessages,
  endAssistantMessage,
  endThinking,
  messagesStore,
  setMessages,
  startAssistantMessage,
  startThinking,
} from '../messages'

describe('messages store', () => {
  describe('addUserMessage', () => {
    it('adds a user message with generated id, role, content, and timestamp', () => {
      addUserMessage('Hello world')

      const { messages } = messagesStore.state
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        role: 'user',
        content: 'Hello world',
      })
      expect(messages[0].id).toMatch(/^msg-\d+-\w+$/)
      expect(messages[0].timestamp).toBeGreaterThan(0)
    })

    it('adds multiple messages in sequence', () => {
      addUserMessage('First')
      addUserMessage('Second')

      const { messages } = messagesStore.state
      expect(messages).toHaveLength(2)
      expect(messages[0].content).toBe('First')
      expect(messages[1].content).toBe('Second')
    })
  })

  describe('assistant message streaming lifecycle', () => {
    it('starts a new assistant message with streaming state', () => {
      startAssistantMessage()

      const { messages, currentMessageId } = messagesStore.state
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        role: 'assistant',
        content: '',
        isStreaming: true,
      })
      expect(currentMessageId).toBe(messages[0].id)
    })

    it('appends stream tokens to the current assistant message', () => {
      startAssistantMessage()
      appendStreamToken('Hello')
      appendStreamToken('Hello world')

      const { messages, streamingContent } = messagesStore.state
      expect(streamingContent).toBe('Hello world')
      expect(messages[0].content).toBe('Hello world')
      expect(messages[0].isStreaming).toBe(true)
    })

    it('ends the assistant message and clears streaming state', () => {
      startAssistantMessage()
      appendStreamToken('Complete message')
      endAssistantMessage()

      const { messages, currentMessageId, streamingContent } =
        messagesStore.state
      expect(messages[0].content).toBe('Complete message')
      expect(messages[0].isStreaming).toBe(false)
      expect(currentMessageId).toBeNull()
      expect(streamingContent).toBe('')
    })

    it('full streaming lifecycle produces a complete message', () => {
      startAssistantMessage()
      appendStreamToken('First')
      appendStreamToken('First token')
      appendStreamToken('First token second')
      endAssistantMessage()

      const { messages } = messagesStore.state
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        role: 'assistant',
        content: 'First token second',
        isStreaming: false,
      })
    })
  })

  describe('thinking lifecycle', () => {
    it('starts thinking on the current assistant message', () => {
      startAssistantMessage()
      startThinking()

      const { messages } = messagesStore.state
      expect(messages[0].isThinking).toBe(true)
    })

    it('appends thinking tokens', () => {
      startAssistantMessage()
      startThinking()
      appendThinkingToken('Let me consider')
      appendThinkingToken('Let me consider this carefully')

      const { messages, thinkingContent } = messagesStore.state
      expect(thinkingContent).toBe('Let me consider this carefully')
      expect(messages[0].thinkingContent).toBe('Let me consider this carefully')
    })

    it('ends thinking and clears isThinking flag', () => {
      startAssistantMessage()
      startThinking()
      appendThinkingToken('Thinking content')
      endThinking()

      const { messages } = messagesStore.state
      expect(messages[0].isThinking).toBe(false)
      expect(messages[0].thinkingContent).toBe('Thinking content')
    })

    it('full thinking → text streaming lifecycle', () => {
      // Start message
      startAssistantMessage()

      // Thinking phase
      startThinking()
      appendThinkingToken('I need to think')
      appendThinkingToken('I need to think about this')
      endThinking()

      // Text phase
      appendStreamToken('After thinking')
      appendStreamToken("After thinking, here's my answer")
      endAssistantMessage()

      const { messages } = messagesStore.state
      expect(messages[0]).toMatchObject({
        role: 'assistant',
        content: "After thinking, here's my answer",
        thinkingContent: 'I need to think about this',
        isThinking: false,
        isStreaming: false,
      })
    })
  })

  describe('edge cases', () => {
    it('appendStreamToken does nothing when no currentMessageId is set', () => {
      appendStreamToken('This should be ignored')

      const { messages, streamingContent } = messagesStore.state
      expect(messages).toHaveLength(0)
      expect(streamingContent).toBe('')
    })

    it('appendThinkingToken does nothing when no currentMessageId is set', () => {
      appendThinkingToken('This should be ignored')

      const { messages, thinkingContent } = messagesStore.state
      expect(messages).toHaveLength(0)
      expect(thinkingContent).toBe('')
    })

    it('startThinking does nothing when no currentMessageId is set', () => {
      startThinking()

      const { messages } = messagesStore.state
      expect(messages).toHaveLength(0)
    })

    it('endThinking does nothing when no currentMessageId is set', () => {
      endThinking()

      const { messages } = messagesStore.state
      expect(messages).toHaveLength(0)
    })
  })

  describe('setMessages', () => {
    it('converts pi Message[] format to DisplayMessage[] format', () => {
      const piMessages = [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'Hello' }],
        },
        {
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: 'Hi there' }],
        },
      ]

      setMessages(piMessages)

      const { messages } = messagesStore.state
      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({
        id: 'msg-0',
        role: 'user',
        content: 'Hello',
      })
      expect(messages[1]).toMatchObject({
        id: 'msg-1',
        role: 'assistant',
        content: 'Hi there',
      })
    })

    it('filters only text content blocks', () => {
      const piMessages = [
        {
          role: 'assistant' as const,
          content: [
            { type: 'text' as const, text: 'First text' },
            {
              type: 'toolCall' as const,
              id: '1',
              name: 'bash',
              arguments: {},
            },
            { type: 'text' as const, text: 'Second text' },
          ],
        },
      ]

      setMessages(piMessages)

      const { messages } = messagesStore.state
      expect(messages[0].content).toBe('First text\n\nSecond text')
    })

    it('assigns approximate timestamps in reverse order', () => {
      const piMessages = [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: '1' }],
        },
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: '2' }],
        },
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: '3' }],
        },
      ]

      setMessages(piMessages)

      const { messages } = messagesStore.state
      // Earlier messages should have earlier (smaller) timestamps
      expect(messages[0].timestamp).toBeLessThan(messages[1].timestamp)
      expect(messages[1].timestamp).toBeLessThan(messages[2].timestamp)
    })
  })

  describe('clearMessages', () => {
    it('resets store to initial state', () => {
      addUserMessage('Test')
      startAssistantMessage()
      appendStreamToken('Test')

      clearMessages()

      expect(messagesStore.state).toEqual({
        messages: [],
        streamingContent: '',
        thinkingContent: '',
        currentMessageId: null,
      })
    })
  })
})

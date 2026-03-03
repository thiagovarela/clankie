import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatMessages } from '../chat-messages'
import {
  addUserMessage,
  appendStreamToken,
  appendThinkingToken,
  endAssistantMessage,
  endThinking,
  startAssistantMessage,
  startThinking,
} from '@/stores/messages'

describe('ChatMessages', () => {
  it('shows placeholder when messages are empty', () => {
    render(<ChatMessages />)

    expect(screen.getByText('Start a conversation')).toBeInTheDocument()
    expect(
      screen.getByText('Send a message to begin chatting with clankie'),
    ).toBeInTheDocument()
  })

  it('renders user messages', () => {
    addUserMessage('Hello, how are you?')

    render(<ChatMessages />)

    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument()
    expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument()
  })

  it('renders assistant messages', () => {
    startAssistantMessage()
    appendStreamToken("I'm doing well, thank you!")
    endAssistantMessage()

    render(<ChatMessages />)

    expect(screen.getByText("I'm doing well, thank you!")).toBeInTheDocument()
  })

  it('renders multiple messages in sequence', () => {
    addUserMessage('First message')
    startAssistantMessage()
    appendStreamToken('Response to first')
    endAssistantMessage()
    addUserMessage('Second message')
    startAssistantMessage()
    appendStreamToken('Response to second')
    endAssistantMessage()

    render(<ChatMessages />)

    expect(screen.getByText('First message')).toBeInTheDocument()
    expect(screen.getByText('Response to first')).toBeInTheDocument()
    expect(screen.getByText('Second message')).toBeInTheDocument()
    expect(screen.getByText('Response to second')).toBeInTheDocument()
  })

  it('shows streaming cursor for in-progress messages', () => {
    startAssistantMessage()
    appendStreamToken('Typing...')
    // Don't call endAssistantMessage - leave it streaming

    const { container } = render(<ChatMessages />)

    expect(screen.getByText('Typing...')).toBeInTheDocument()

    // Check for streaming cursor
    const cursor = container.querySelector('.animate-pulse')
    expect(cursor).toBeInTheDocument()
  })

  it('updates when new messages are added', () => {
    const { rerender } = render(<ChatMessages />)

    expect(screen.getByText('Start a conversation')).toBeInTheDocument()

    addUserMessage('New message')
    rerender(<ChatMessages />)

    expect(screen.getByText('New message')).toBeInTheDocument()
    expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument()
  })

  describe('message ordering', () => {
    it('renders messages in chronological order', () => {
      addUserMessage('Message 1')
      addUserMessage('Message 2')
      addUserMessage('Message 3')

      const { container } = render(<ChatMessages />)

      // Get all message bubbles in order
      const messages = Array.from(
        container.querySelectorAll('.whitespace-pre-wrap, .prose'),
      )
      const messageTexts = messages.map((el) => el.textContent)

      expect(messageTexts[0]).toContain('Message 1')
      expect(messageTexts[1]).toContain('Message 2')
      expect(messageTexts[2]).toContain('Message 3')
    })
  })

  describe('auto-scroll behavior', () => {
    it('renders scroll reference div at bottom', () => {
      addUserMessage('Test')

      const { container } = render(<ChatMessages />)

      // Check that a ref div exists (used for auto-scroll)
      // This is the div with ref={bottomRef} that gets scrollIntoView
      const scrollTarget = container.querySelector('div:last-child')
      expect(scrollTarget).toBeInTheDocument()
    })
  })

  describe('layout', () => {
    it('applies correct container classes with messages', () => {
      addUserMessage('Test') // Add a message so content renders

      const { container } = render(<ChatMessages />)

      // Check for overflow scroll container
      const scrollContainer = container.querySelector('.overflow-y-auto')
      expect(scrollContainer).toBeInTheDocument()

      // Check for message spacing
      const messagesContainer = container.querySelector('.space-y-4')
      expect(messagesContainer).toBeInTheDocument()
    })

    it('applies overflow scroll container in empty state', () => {
      const { container } = render(<ChatMessages />)

      // Check for overflow scroll container even when empty
      const scrollContainer = container.querySelector('.overflow-y-auto')
      expect(scrollContainer).toBeInTheDocument()
    })
  })

  describe('thinking-only message grouping', () => {
    it('groups consecutive thinking-only assistant messages', () => {
      // Create 3 thinking-only messages
      startAssistantMessage()
      startThinking()
      appendThinkingToken('First thinking step')
      endThinking()
      endAssistantMessage()

      startAssistantMessage()
      startThinking()
      appendThinkingToken('Second thinking step')
      endThinking()
      endAssistantMessage()

      startAssistantMessage()
      startThinking()
      appendThinkingToken('Third thinking step')
      endThinking()
      endAssistantMessage()

      render(<ChatMessages />)

      // Should show a single compact indicator with "3 steps"
      expect(screen.getByText('3 steps')).toBeInTheDocument()
      expect(screen.getByText('💭 Thinking')).toBeInTheDocument()
    })

    it('renders thinking-only messages separately from text messages', () => {
      // Thinking-only message
      startAssistantMessage()
      startThinking()
      appendThinkingToken('Thinking')
      endThinking()
      endAssistantMessage()

      // Regular assistant message with text
      startAssistantMessage()
      appendStreamToken('Here is my response')
      endAssistantMessage()

      render(<ChatMessages />)

      // Should have both: compact thinking indicator + regular message bubble
      expect(screen.getByText('1 step')).toBeInTheDocument()
      expect(screen.getByText('Here is my response')).toBeInTheDocument()
    })

    it('does not group thinking-only messages across user messages', () => {
      // First thinking-only message
      startAssistantMessage()
      startThinking()
      appendThinkingToken('First thought')
      endThinking()
      endAssistantMessage()

      // User message in between
      addUserMessage('What do you think?')

      // Second thinking-only message
      startAssistantMessage()
      startThinking()
      appendThinkingToken('Second thought')
      endThinking()
      endAssistantMessage()

      render(<ChatMessages />)

      // Should show two separate "1 step" indicators (not grouped)
      const stepIndicators = screen.getAllByText('1 step')
      expect(stepIndicators).toHaveLength(2)
    })

    it('renders regular assistant messages with thinking as normal bubbles', () => {
      // Assistant message with both thinking and text content
      startAssistantMessage()
      startThinking()
      appendThinkingToken('Let me think')
      endThinking()
      appendStreamToken('Here is my answer')
      endAssistantMessage()

      const { container } = render(<ChatMessages />)

      // Should render as a normal message bubble with prose content
      const proseContent = container.querySelector('.prose')
      expect(proseContent).toBeInTheDocument()
      expect(proseContent?.textContent).toContain('Here is my answer')

      // The compact "💭 Thinking" indicator should NOT appear
      expect(screen.queryByText('💭 Thinking')).not.toBeInTheDocument()
    })

    it('handles a single thinking-only message', () => {
      startAssistantMessage()
      startThinking()
      appendThinkingToken('Single thought')
      endThinking()
      endAssistantMessage()

      render(<ChatMessages />)

      expect(screen.getByText('1 step')).toBeInTheDocument()
      expect(screen.getByText(/Single thought/)).toBeInTheDocument()
    })

    it('shows live indicator for streaming thinking-only message', () => {
      startAssistantMessage()
      startThinking()
      appendThinkingToken('Currently thinking')
      // Don't call endThinking - leave it streaming

      const { container } = render(<ChatMessages />)

      expect(screen.getByText('1 step')).toBeInTheDocument()
      // Should show spinner for live thinking
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })
})

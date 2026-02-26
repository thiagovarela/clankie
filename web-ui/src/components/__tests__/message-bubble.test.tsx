/**
 * Tests for MessageBubble component — pure presentational component.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageBubble } from '../message-bubble'
import { makeDisplayMessage } from '@/test/fixtures'

describe('MessageBubble', () => {
  describe('user messages', () => {
    it('renders user message with correct content', () => {
      const message = makeDisplayMessage({
        role: 'user',
        content: 'Hello, how are you?',
      })

      render(<MessageBubble message={message} />)

      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument()
    })

    it('renders user icon', () => {
      const message = makeDisplayMessage({
        role: 'user',
        content: 'Test',
      })

      const { container } = render(<MessageBubble message={message} />)

      // User icon SVG should be present
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders plain text for user messages (no markdown)', () => {
      const message = makeDisplayMessage({
        role: 'user',
        content: '**bold** text',
      })

      const { container } = render(<MessageBubble message={message} />)

      // Should render literally, not as markdown
      expect(screen.getByText('**bold** text')).toBeInTheDocument()
      // No <strong> tag should exist
      expect(container.querySelector('strong')).not.toBeInTheDocument()
    })
  })

  describe('assistant messages', () => {
    it('renders assistant message with markdown', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'This is **bold** text',
      })

      const { container } = render(<MessageBubble message={message} />)

      // Should have rendered markdown
      const strong = container.querySelector('strong')
      expect(strong).toBeInTheDocument()
      expect(strong?.textContent).toBe('bold')
    })

    it('renders bot icon for assistant', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Test',
      })

      const { container } = render(<MessageBubble message={message} />)

      // Bot icon SVG should be present
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('shows "..." when content is empty', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: '',
      })

      render(<MessageBubble message={message} />)

      expect(screen.getByText('...')).toBeInTheDocument()
    })

    it('shows streaming cursor when isStreaming is true', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Typing',
        isStreaming: true,
      })

      const { container } = render(<MessageBubble message={message} />)

      // Look for the cursor span with animate-pulse class
      const cursor = container.querySelector('.animate-pulse')
      expect(cursor).toBeInTheDocument()
    })

    it('does not show streaming cursor for user messages', () => {
      const message = makeDisplayMessage({
        role: 'user',
        content: 'Test',
        isStreaming: true,
      })

      const { container } = render(<MessageBubble message={message} />)

      const cursor = container.querySelector('.animate-pulse')
      expect(cursor).not.toBeInTheDocument()
    })
  })

  describe('thinking content', () => {
    it('shows thinking block when isThinking and has thinkingContent', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Final answer',
        isThinking: true,
        thinkingContent: 'Let me think about this...',
      })

      render(<MessageBubble message={message} />)

      expect(screen.getByText('Thinking...')).toBeInTheDocument()
      expect(screen.getByText('Let me think about this...')).toBeInTheDocument()
    })

    it('shows thinking block with spinner icon', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Answer',
        isThinking: true,
        thinkingContent: 'Processing...',
      })

      const { container } = render(<MessageBubble message={message} />)

      // Look for the Loader2 icon with animate-spin
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('does not show thinking block when isThinking but no thinkingContent', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Answer',
        isThinking: true,
        thinkingContent: undefined,
      })

      render(<MessageBubble message={message} />)

      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
    })

    it('does not show thinking block when not isThinking', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Answer',
        isThinking: false,
        thinkingContent: 'Some content',
      })

      render(<MessageBubble message={message} />)

      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
    })
  })
})

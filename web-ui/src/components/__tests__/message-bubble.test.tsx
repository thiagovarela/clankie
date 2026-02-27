import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageBubble } from '../message-bubble'
import { makeDisplayMessage } from '@/test/fixtures'

describe('MessageBubble', () => {
  describe('user messages', () => {
    it('renders user message with correct styling', () => {
      const message = makeDisplayMessage({
        role: 'user',
        content: 'Hello world',
      })

      const { container } = render(<MessageBubble message={message} />)

      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(container.querySelector('.justify-end')).toBeInTheDocument()
      expect(container.querySelector('.bg-primary')).toBeInTheDocument()
      expect(
        container.querySelector('svg[class*="lucide-user"]'),
      ).toBeInTheDocument()
    })
  })

  describe('assistant messages', () => {
    it('renders assistant message content and summary header when metadata exists', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'A concise answer',
        persistedThinkingContent: 'Reasoning block',
      })

      const { container } = render(<MessageBubble message={message} />)

      expect(
        screen.getByRole('button', { name: /a concise answer/i }),
      ).toBeInTheDocument()
      expect(screen.getAllByText('A concise answer')).toHaveLength(2)
      expect(container.querySelector('.bg-muted')).toBeInTheDocument()
      expect(
        container.querySelector('svg[class*="lucide-bot"]'),
      ).toBeInTheDocument()
    })

    it('keeps metadata collapsed by default and expands on click', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Answer text',
        thinkingContent: 'Let me think about this',
        isThinking: true,
      })

      render(<MessageBubble message={message} />)

      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /answer text/i }))
      expect(screen.getByText('Thinking...')).toBeInTheDocument()
      expect(screen.getByText('Let me think about this')).toBeInTheDocument()
    })

    it('shows streaming cursor when isStreaming is true', () => {
      const message = makeDisplayMessage({
        role: 'assistant',
        content: 'Typing...',
        isStreaming: true,
      })

      const { container } = render(<MessageBubble message={message} />)

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    })
  })
})

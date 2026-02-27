import { useStore } from '@tanstack/react-store'
import { useEffect, useRef } from 'react'
import { MessageBubble } from './message-bubble'
import { ThinkingStepsIndicator } from './thinking-steps-indicator'
import type { DisplayMessage } from '@/stores/messages'
import { messagesStore } from '@/stores/messages'

type MessageGroup =
  | { type: 'message'; message: DisplayMessage }
  | { type: 'thinking-steps'; messages: Array<DisplayMessage> }

/**
 * Check if a message is thinking-only (no text content, but has thinking content)
 */
function isThinkingOnlyMessage(message: DisplayMessage): boolean {
  if (message.role !== 'assistant') return false
  const hasText = message.content.trim().length > 0
  const hasThinking =
    (message.thinkingContent ?? message.persistedThinkingContent ?? '').trim()
      .length > 0
  return !hasText && hasThinking
}

/**
 * Group consecutive thinking-only assistant messages together.
 * All other messages remain as individual groups.
 */
function groupMessages(messages: Array<DisplayMessage>): Array<MessageGroup> {
  const groups: Array<MessageGroup> = []
  let thinkingBuffer: Array<DisplayMessage> = []

  for (const message of messages) {
    if (isThinkingOnlyMessage(message)) {
      // Add to the thinking buffer
      thinkingBuffer.push(message)
    } else {
      // Flush any buffered thinking-only messages as a group
      if (thinkingBuffer.length > 0) {
        groups.push({ type: 'thinking-steps', messages: thinkingBuffer })
        thinkingBuffer = []
      }
      // Add the current message as its own group
      groups.push({ type: 'message', message })
    }
  }

  // Flush any remaining thinking-only messages
  if (thinkingBuffer.length > 0) {
    groups.push({ type: 'thinking-steps', messages: thinkingBuffer })
  }

  return groups
}

export function ChatMessages() {
  const { messages } = useStore(messagesStore, (state) => ({
    messages: state.messages,
  }))

  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 chat-background">
        <div className="text-center space-y-4 max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
            <span className="text-3xl font-mono font-bold text-primary">
              c/
            </span>
          </div>
          <p className="text-xl font-semibold">Start a conversation</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Send a message to begin chatting with{' '}
            <span className="font-mono text-primary">clankie</span>, your
            personal AI assistant that lives in your workspace.
          </p>
          <div className="pt-2 flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
            <span className="px-3 py-1 rounded-full bg-muted/50">
              💬 Natural language
            </span>
            <span className="px-3 py-1 rounded-full bg-muted/50">
              🔧 Tools & commands
            </span>
            <span className="px-3 py-1 rounded-full bg-muted/50">
              📎 File uploads
            </span>
          </div>
        </div>
      </div>
    )
  }

  const groups = groupMessages(messages)

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 chat-background">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {groups.map((group) =>
          group.type === 'message' ? (
            <MessageBubble key={group.message.id} message={group.message} />
          ) : (
            <ThinkingStepsIndicator
              key={group.messages[0].id}
              messages={group.messages}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

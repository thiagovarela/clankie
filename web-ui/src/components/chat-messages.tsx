import { useStore } from '@tanstack/react-store'
import { useEffect, useRef } from 'react'
import { MessageBubble } from './message-bubble'
import { messagesStore } from '@/stores/messages'

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
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Start a conversation</p>
          <p className="text-sm text-muted-foreground">
            Send a message to begin chatting with clankie
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

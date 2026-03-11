import { useEffect, useState } from 'react'
import { AssistantMessageContent } from './assistant-message-content'
import { MessageAttachments } from './message-attachments'
import type { DisplayMessage } from '@/stores/messages'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: DisplayMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [showStreamingIndicator, setShowStreamingIndicator] = useState(
    Boolean(message.isStreaming),
  )

  useEffect(() => {
    if (message.isStreaming) {
      setShowStreamingIndicator(true)
      return
    }

    // Keep the indicator visible briefly to avoid rapid hide/show flicker
    const timeoutId = window.setTimeout(() => {
      setShowStreamingIndicator(false)
    }, 180)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [message.isStreaming])

  return (
    <div
      className={cn(
        'flex w-full animate-message-enter',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          isUser
            ? 'max-w-[80%] rounded-2xl rounded-br-md px-4 py-3 text-primary-foreground message-user'
            : 'w-full max-w-3xl text-foreground',
        )}
      >
        {isUser ? (
          <div className="space-y-1">
            <MessageAttachments attachments={message.attachments} />
            {message.content ? (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                {message.content}
              </p>
            ) : null}
          </div>
        ) : (
          <AssistantMessageContent message={message} />
        )}

        {showStreamingIndicator && !isUser && (
          <span className="ml-2 inline-flex gap-1">
            <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
            <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
            <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
          </span>
        )}
      </div>
    </div>
  )
}

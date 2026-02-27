import { Bot, User } from 'lucide-react'
import { AssistantMessageContent } from './assistant-message-content'
import { MessageAttachments } from './message-attachments'
import type { DisplayMessage } from '@/stores/messages'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: DisplayMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {isUser ? (
          <>
            <MessageAttachments attachments={message.attachments} />
            {message.content ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : null}
          </>
        ) : (
          <AssistantMessageContent message={message} />
        )}

        {message.isStreaming && !isUser && (
          <span className="inline-block h-3 w-1 animate-pulse bg-current ml-1" />
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

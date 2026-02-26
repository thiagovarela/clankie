import { Bot, Loader2, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolExecutionList } from './tool-execution-list'
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
        {message.isThinking && message.thinkingContent && (
          <div className="mb-2 rounded border border-border bg-background/50 p-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="font-medium">Thinking...</span>
            </div>
            <p className="text-muted-foreground italic">
              {message.thinkingContent}
            </p>
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <ToolExecutionList messageId={message.id} />
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content || '...'}
              </ReactMarkdown>
            </div>
          </>
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

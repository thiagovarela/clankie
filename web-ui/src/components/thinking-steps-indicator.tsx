import { ChevronDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { DisplayMessage } from '@/stores/messages'
import { cn } from '@/lib/utils'

interface ThinkingStepsIndicatorProps {
  messages: Array<DisplayMessage>
}

function getThinkingText(message: DisplayMessage): string {
  return message.thinkingContent ?? message.persistedThinkingContent ?? ''
}

function truncateThinkingText(text: string, maxLength = 50): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}…`
}

export function ThinkingStepsIndicator({
  messages,
}: ThinkingStepsIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Determine if any message in the group is actively streaming/thinking
  const isLive = messages.some((msg) => msg.isThinking || msg.isStreaming)

  // Get the latest thinking text (from the last message in the group)
  const latestMessage = messages[messages.length - 1]
  const latestThinking = getThinkingText(latestMessage)
  const latestThinkingTruncated = truncateThinkingText(latestThinking)

  const stepCount = messages.length

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left transition-colors',
          'border-border/60 bg-muted/30 hover:bg-muted/50',
          isExpanded && 'bg-muted/50',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>💭 Thinking</span>
            {isLive && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>

          {!isExpanded && latestThinking && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="min-w-0 truncate text-xs italic text-muted-foreground">
                {latestThinkingTruncated}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform',
              isExpanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 rounded-lg border border-border/60 bg-card/95 p-3 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <ol className="space-y-2 text-xs">
            {messages.map((msg, index) => {
              const thinkingText = getThinkingText(msg)
              return (
                <li key={msg.id} className="flex gap-2 text-muted-foreground">
                  <span className="shrink-0 font-medium text-primary">
                    {index + 1}.
                  </span>
                  <span className="whitespace-pre-wrap italic">
                    {thinkingText || '(empty)'}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}

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
    <div className="relative w-full max-w-2xl">
      {/* Main thinking card */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all',
          isLive ? 'thinking-card-live' : 'thinking-card',
          'hover:brightness-105',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Thinking icon */}
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-accent/20 text-accent-foreground">
            <span className="text-xs">💭</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/90">
            <span>Thinking</span>
            {isLive && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          </div>

          {!isExpanded && latestThinking && (
            <>
              <span className="text-xs text-muted-foreground/60">·</span>
              <span className="min-w-0 truncate text-xs italic text-muted-foreground/70">
                {latestThinkingTruncated}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            {stepCount}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground/60 transition-transform',
              isExpanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Expanded thinking steps */}
      {isExpanded && (
        <div className="mt-2 rounded-lg border border-border/50 bg-card/80 p-3 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-150">
          <ol className="space-y-2 text-xs">
            {messages.map((msg, index) => {
              const thinkingText = getThinkingText(msg)
              const isActive = msg.isThinking || msg.isStreaming
              return (
                <li 
                  key={msg.id} 
                  className={cn(
                    "flex gap-2 p-1.5 rounded",
                    isActive && "bg-primary/5"
                  )}
                >
                  <span className={cn(
                    "shrink-0 font-mono text-[10px] w-4 h-4 flex items-center justify-center rounded",
                    isActive ? "bg-primary/20 text-primary" : "text-muted-foreground/50"
                  )}>
                    {index + 1}
                  </span>
                  <span className={cn(
                    "whitespace-pre-wrap italic leading-relaxed",
                    isActive ? "text-foreground/80" : "text-muted-foreground/60"
                  )}>
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

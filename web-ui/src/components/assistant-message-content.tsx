import { useStore } from '@tanstack/react-store'
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolExecutionList } from './tool-execution-list'
import type { DisplayMessage } from '@/stores/messages'
import { cn } from '@/lib/utils'
import {
  getToolExecutionsForMessage,
  toolExecutionsStore,
} from '@/stores/tool-executions'

interface AssistantMessageContentProps {
  message: DisplayMessage
}

function summarizeAssistantContent(content: string): string {
  const normalized = content.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return 'Assistant response'
  }

  if (normalized.length <= 50) {
    return normalized
  }

  return `${normalized.slice(0, 50)}…`
}

export function AssistantMessageContent({
  message,
}: AssistantMessageContentProps) {
  const [isMetaExpanded, setIsMetaExpanded] = useState(false)

  const executions = useStore(toolExecutionsStore, (state) =>
    getToolExecutionsForMessage(message.id, state),
  )

  const thinkingText =
    message.thinkingContent ?? message.persistedThinkingContent ?? ''
  const hasThinking = thinkingText.length > 0
  const hasTools = executions.length > 0
  const hasMeta = hasThinking || hasTools

  const allToolsCompleted =
    hasTools && executions.every((execution) => execution.status !== 'running')

  return (
    <>
      {hasMeta && (
        <div className="mb-3">
          <button
            className="flex w-full items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2 text-left text-sm"
            onClick={() => setIsMetaExpanded((v) => !v)}
            type="button"
          >
            <span className="font-medium text-foreground">
              {summarizeAssistantContent(message.content)}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                isMetaExpanded && 'rotate-180',
              )}
            />
          </button>

          {isMetaExpanded && (
            <div className="mt-2 space-y-3 rounded-md border border-border bg-background/40 p-3">
              {hasThinking && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span className="font-medium">
                      {message.isThinking ? 'Thinking...' : 'Thinking'}
                    </span>
                    {message.isThinking && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                  </div>
                  <p className="whitespace-pre-wrap italic text-muted-foreground">
                    {thinkingText}
                  </p>
                </div>
              )}

              {hasTools && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {allToolsCompleted ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5" />
                    )}
                    <span className="font-medium">
                      {allToolsCompleted
                        ? 'Done'
                        : `Running ${executions.length} tool${executions.length > 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <ToolExecutionList messageId={message.id} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!hasMeta && <ToolExecutionList messageId={message.id} />}

      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.content || '...'}
        </ReactMarkdown>
      </div>
    </>
  )
}

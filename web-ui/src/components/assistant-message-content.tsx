import { ChevronDown, Clock3, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { ToolExecutionList } from './tool-execution-list'
import { JsonRenderRenderer } from '@/lib/tool-renderers/json-render-renderer'
import type { ExtensionUISpec } from '@/lib/tool-renderers/types'
import type { DisplayMessage } from '@/stores/messages'
import { cn } from '@/lib/utils'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExtensionUISpec(value: unknown): value is ExtensionUISpec {
  return (
    isRecord(value) &&
    typeof value.root === 'string' &&
    isRecord(value.elements) &&
    (value.actions === undefined || isRecord(value.actions))
  )
}

function tryParseExtensionUISpec(content: string): {
  spec: ExtensionUISpec | null
  markdown: string
} {
  const trimmed = content.trim()

  try {
    const parsed = JSON.parse(trimmed)
    if (isExtensionUISpec(parsed)) {
      return { spec: parsed, markdown: '' }
    }
  } catch {
    // ignore plain JSON parse failures
  }

  const fencedJsonRegex = /```(?:json)?\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = fencedJsonRegex.exec(content)) !== null) {
    const candidate = match[1]?.trim()
    if (!candidate) continue

    try {
      const parsed = JSON.parse(candidate)
      if (isExtensionUISpec(parsed)) {
        const markdown = `${content.slice(0, match.index)}${content.slice(match.index + match[0].length)}`.trim()
        return { spec: parsed, markdown }
      }
    } catch {
      // ignore invalid fenced json
    }
  }

  return { spec: null, markdown: content }
}

export function AssistantMessageContent({
  message,
}: AssistantMessageContentProps) {
  const [isMetaExpanded, setIsMetaExpanded] = useState(false)

  const thinkingText =
    message.thinkingContent ?? message.persistedThinkingContent ?? ''
  const hasThinking = thinkingText.length > 0

  const { spec: inlineUiSpec, markdown } = useMemo(
    () => tryParseExtensionUISpec(message.content),
    [message.content],
  )

  return (
    <>
      {hasThinking && (
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
            </div>
          )}
        </div>
      )}

      {/* Tool executions inline before content */}
      <ToolExecutionList messageId={message.id} />

      {markdown.trim().length > 0 ? (
        <div className="prose prose-base dark:prose-invert max-w-none text-muted-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      ) : null}

      {inlineUiSpec ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <JsonRenderRenderer spec={inlineUiSpec} />
        </div>
      ) : null}

      {!inlineUiSpec && !markdown.trim().length && message.isStreaming ? (
        <div className="prose prose-base dark:prose-invert max-w-none text-muted-foreground">
          ...
        </div>
      ) : null}
    </>
  )
}

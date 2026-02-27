import { ChevronRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { ToolExecution } from '@/stores/tool-executions'
import type {
  ExtensionRenderHint,
  ExtensionUISpec,
} from '@/lib/tool-renderers/types'
import {
  getToolCommandSummary,
  getToolOutputText,
} from '@/lib/tool-renderers/summary'
import { JsonRenderRenderer } from '@/lib/tool-renderers/json-render-renderer'
import { RenderHintRenderer } from '@/lib/tool-renderers/render-hint-renderer'
import { cn } from '@/lib/utils'

export function ToolExecutionCard({ execution }: { execution: ToolExecution }) {
  const [expanded, setExpanded] = useState(execution.status !== 'completed')

  const summary = getToolCommandSummary(execution)
  const Icon = summary.icon
  const output = getToolOutputText(execution)

  // Check for extension rendering hints
  const details =
    execution.result?.details ?? execution.partialResult?.details ?? {}
  const renderHint = details.renderHint as ExtensionRenderHint | undefined
  const uiSpec = details.uiSpec as ExtensionUISpec | undefined

  const hasSpecialRendering = Boolean(renderHint || uiSpec)

  return (
    <div
      className={cn(
        'group text-xs',
        execution.status === 'error' && 'text-destructive',
      )}
    >
      {/* Collapsible summary line */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors',
          'hover:bg-muted/50',
          execution.status === 'error' && 'hover:bg-destructive/10',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 transition-transform text-muted-foreground',
            expanded && 'rotate-90',
          )}
        />
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            execution.toolName === 'bash' && 'text-emerald-500',
            execution.toolName === 'read' && 'text-blue-500',
            execution.toolName === 'write' && 'text-emerald-500',
            execution.toolName === 'edit' && 'text-amber-500',
            execution.toolName === 'grep' && 'text-violet-500',
            execution.toolName === 'find' && 'text-cyan-500',
            execution.toolName === 'ls' && 'text-indigo-500',
            !['bash', 'read', 'write', 'edit', 'grep', 'find', 'ls'].includes(
              execution.toolName,
            ) && 'text-muted-foreground',
          )}
        />
        <span className="font-mono">{execution.toolName}</span>
        {summary.command && (
          <>
            <span className="text-muted-foreground">›</span>
            <span className="truncate font-mono text-muted-foreground">
              {summary.command}
            </span>
          </>
        )}
        {execution.status === 'running' && (
          <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
        )}
        {execution.status === 'error' && (
          <span className="ml-auto shrink-0 text-destructive">failed</span>
        )}
      </button>

      {/* Expanded output */}
      {expanded && (
        <div className="mt-1 ml-5 rounded-md border border-border bg-muted/30 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {hasSpecialRendering ? (
            <>
              {renderHint && (
                <RenderHintRenderer
                  hint={renderHint}
                  data={details.data ?? details.content ?? details}
                />
              )}
              {uiSpec && <JsonRenderRenderer spec={uiSpec} />}
            </>
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
              {output || '(no output)'}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

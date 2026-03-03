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

  // Tool icon color mapping
  const toolColorClass = {
    bash: 'tool-icon-bash',
    read: 'tool-icon-read',
    write: 'tool-icon-write',
    edit: 'tool-icon-edit',
    grep: 'tool-icon-grep',
    find: 'tool-icon-find',
    ls: 'tool-icon-ls',
  }[execution.toolName] || 'tool-icon-default'

  return (
    <div
      className={cn(
        'group text-xs my-1',
        execution.status === 'error' && 'text-destructive',
      )}
    >
      {/* Collapsible summary line */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-all',
          'hover:bg-muted/40',
          execution.status === 'error' && 'hover:bg-destructive/10',
          expanded && 'bg-muted/30',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
            expanded && 'rotate-90',
            execution.status === 'error' ? 'text-destructive/60' : 'text-muted-foreground/50',
          )}
        />
        
        <div className={cn(
          'flex items-center justify-center w-5 h-5 rounded bg-muted/50',
          toolColorClass,
        )}>
          <Icon className="h-3 w-3" />
        </div>
        
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
          {execution.toolName}
        </span>
        
        {summary.command && (
          <>
            <span className="text-muted-foreground/30">›</span>
            <span className="truncate font-mono text-muted-foreground/60">
              {summary.command}
            </span>
          </>
        )}
        
        {execution.status === 'running' && (
          <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin text-primary/60" />
        )}
        {execution.status === 'error' && (
          <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-destructive/80">
            failed
          </span>
        )}
        {execution.status === 'completed' && !expanded && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">
            done
          </span>
        )}
      </button>

      {/* Expanded output */}
      {expanded && (
        <div className="mt-1 ml-6 rounded-lg tool-card-expanded p-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {hasSpecialRendering ? (
            <div className="space-y-2">
              {renderHint && (
                <RenderHintRenderer
                  hint={renderHint}
                  data={details.data ?? details.content ?? details}
                />
              )}
              {uiSpec && <JsonRenderRenderer spec={uiSpec} />}
            </div>
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed font-mono text-muted-foreground/80">
              {output || '(no output)'}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

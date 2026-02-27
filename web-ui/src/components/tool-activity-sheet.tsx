import { useStore } from '@tanstack/react-store'
import { Activity, Clock3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ToolExecution } from '@/stores/tool-executions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { builtInRenderers } from '@/lib/tool-renderers'
import { cn } from '@/lib/utils'
import { toolExecutionsStore } from '@/stores/tool-executions'

interface ToolActivitySheetProps {
  disabled?: boolean
}

function isBuiltInTool(toolName: string): boolean {
  return Object.hasOwn(builtInRenderers, toolName)
}

function getStatusVariant(status: ToolExecution['status']) {
  if (status === 'error') return 'destructive'
  if (status === 'running') return 'secondary'
  return 'outline'
}

function getResultPreview(execution: ToolExecution): string {
  const source = execution.result ?? execution.partialResult

  const text = source?.content?.find(
    (item): item is { type: 'text'; text: string } =>
      'type' in item &&
      item.type === 'text' &&
      'text' in item &&
      typeof item.text === 'string',
  )

  if (text?.text) {
    return text.text
  }

  if (source?.details) {
    return JSON.stringify(source.details, null, 2)
  }

  return execution.status === 'running' ? 'Running…' : 'No output'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ToolActivitySheet({ disabled }: ToolActivitySheetProps) {
  const [open, setOpen] = useState(false)

  const executions = useStore(toolExecutionsStore, (state) =>
    state.executionOrder
      .map((id) => state.executions[id])
      .filter((execution): execution is ToolExecution => Boolean(execution))
      .filter((execution) => isBuiltInTool(execution.toolName)),
  )

  const runningCount = executions.filter((e) => e.status === 'running').length

  const orderedExecutions = useMemo(
    () => [...executions].sort((a, b) => b.startTime - a.startTime),
    [executions],
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Activity className="h-4 w-4" />
        Tool activity
        <Badge variant={runningCount > 0 ? 'secondary' : 'outline'}>
          {runningCount > 0 ? `${runningCount} running` : executions.length}
        </Badge>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Tool activity</SheetTitle>
            <SheetDescription>
              Built-in tool calls from this session.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {orderedExecutions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No built-in tool calls yet.
              </div>
            ) : (
              <div className="space-y-3">
                {orderedExecutions.map((execution) => (
                  <details
                    key={execution.toolCallId}
                    className="rounded-md border border-border bg-card"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {execution.toolName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(execution.startTime)}
                        </p>
                      </div>

                      <Badge variant={getStatusVariant(execution.status)}>
                        {execution.status}
                      </Badge>
                    </summary>

                    <div className="space-y-2 border-t border-border px-3 py-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Args
                        </p>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                          {JSON.stringify(execution.args, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Result
                        </p>
                        <pre
                          className={cn(
                            'max-h-52 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs',
                            execution.status === 'error' &&
                              'border border-destructive/30',
                          )}
                        >
                          {getResultPreview(execution)}
                        </pre>
                      </div>

                      {execution.endTime && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          Completed at {formatTime(execution.endTime)}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

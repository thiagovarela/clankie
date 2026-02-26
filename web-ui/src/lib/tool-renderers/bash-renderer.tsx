import { Loader2, Terminal } from 'lucide-react'
import type { ToolRendererProps } from './types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

function getTextResult(execution: ToolRendererProps['execution']): string {
  const source = execution.result ?? execution.partialResult
  const first = source?.content?.find((c) => (c as any)?.type === 'text') as
    | { type: 'text'; text: string }
    | undefined
  return first?.text ?? ''
}

export function BashRenderer({
  execution,
  expanded,
  onToggleExpand,
}: ToolRendererProps) {
  const output = getTextResult(execution)
  const command = String((execution.args as any)?.command ?? '')

  return (
    <Card className="bg-zinc-950 border-zinc-800 text-zinc-100">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 font-mono text-xs">
            <Terminal className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-zinc-500">$</span>
            <span className="truncate">{command}</span>
            {execution.status === 'running' && (
              <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="py-2 px-3">
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
            {output || '(no output)'}
          </pre>
        </CardContent>
      )}
    </Card>
  )
}

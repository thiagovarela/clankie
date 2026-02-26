import { FileText } from 'lucide-react'
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

export function ReadRenderer({
  execution,
  expanded,
  onToggleExpand,
}: ToolRendererProps) {
  const output = getTextResult(execution)
  const path = String((execution.args as any)?.path ?? '')

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="font-mono truncate">read {path}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="py-2 px-3">
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
            {output || '(empty)'}
          </pre>
        </CardContent>
      )}
    </Card>
  )
}

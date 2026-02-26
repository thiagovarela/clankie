import { Search } from 'lucide-react'
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

export function GrepRenderer({
  execution,
  expanded,
  onToggleExpand,
}: ToolRendererProps) {
  const output = getTextResult(execution)
  const pattern = String((execution.args as any)?.pattern ?? '')

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Search className="h-3.5 w-3.5 text-violet-500" />
            <span className="font-mono truncate">grep {pattern}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="py-2 px-3">
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
            {output || '(no matches)'}
          </pre>
        </CardContent>
      )}
    </Card>
  )
}

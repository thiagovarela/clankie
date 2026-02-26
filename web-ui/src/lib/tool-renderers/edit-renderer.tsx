import { FilePenLine } from 'lucide-react'
import type { ToolRendererProps } from './types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function EditRenderer({
  execution,
  expanded,
  onToggleExpand,
}: ToolRendererProps) {
  const details = execution.result?.details as { diff?: string } | undefined
  const diff = details?.diff ?? ''
  const path = String((execution.args as any)?.path ?? '')

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <FilePenLine className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="font-mono truncate">edit {path}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="py-2 px-3">
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
            {diff || 'Edit applied'}
          </pre>
        </CardContent>
      )}
    </Card>
  )
}

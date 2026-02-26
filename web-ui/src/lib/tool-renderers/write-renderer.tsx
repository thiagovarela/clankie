import { FilePlus2 } from 'lucide-react'
import type { ToolRendererProps } from './types'
import { Card, CardHeader } from '@/components/ui/card'

export function WriteRenderer({ execution }: ToolRendererProps) {
  const path = String((execution.args as any)?.path ?? '')

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center gap-2 text-xs">
          <FilePlus2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-mono truncate">write {path}</span>
          <span className="text-muted-foreground ml-auto">
            {execution.status === 'error' ? 'failed' : 'done'}
          </span>
        </div>
      </CardHeader>
    </Card>
  )
}

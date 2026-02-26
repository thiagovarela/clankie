import { Wrench } from 'lucide-react'
import { JsonRenderRenderer } from './json-render-renderer'
import { RenderHintRenderer } from './render-hint-renderer'
import type {
  ExtensionRenderHint,
  ExtensionUISpec,
  ToolRendererProps,
} from './types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function FallbackRenderer({
  execution,
  expanded,
  onToggleExpand,
}: ToolRendererProps) {
  const details =
    execution.result?.details ?? execution.partialResult?.details ?? {}

  const renderHint = details.renderHint as ExtensionRenderHint | undefined
  if (renderHint) {
    const hintData = details.data ?? details.content ?? details
    return (
      <Card>
        <CardHeader className="py-2 px-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Wrench className="h-3.5 w-3.5" />
            {execution.toolName}
          </div>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <RenderHintRenderer hint={renderHint} data={hintData} />
        </CardContent>
      </Card>
    )
  }

  const uiSpec = details.uiSpec as ExtensionUISpec | undefined
  if (uiSpec) {
    return (
      <Card>
        <CardHeader className="py-2 px-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Wrench className="h-3.5 w-3.5" />
            {execution.toolName}
          </div>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <JsonRenderRenderer spec={uiSpec} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0 font-mono">
            <Wrench className="h-3.5 w-3.5" />
            <span className="truncate">{execution.toolName}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="py-2 px-3 space-y-2">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">args</p>
            <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(execution.args, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">result</p>
            <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(
                execution.result ?? execution.partialResult,
                null,
                2,
              )}
            </pre>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

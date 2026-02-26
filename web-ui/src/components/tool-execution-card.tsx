import { useState } from 'react'
import type { ToolExecution } from '@/stores/tool-executions'
import { FallbackRenderer, builtInRenderers } from '@/lib/tool-renderers'

export function ToolExecutionCard({ execution }: { execution: ToolExecution }) {
  const [expanded, setExpanded] = useState(execution.status !== 'completed')
  const Renderer = builtInRenderers[execution.toolName] ?? FallbackRenderer

  return (
    <Renderer
      execution={execution}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
    />
  )
}

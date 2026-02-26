import type { ComponentType } from 'react'
import type { ToolExecution } from '@/stores/tool-executions'

export interface ToolRendererProps {
  execution: ToolExecution
  expanded: boolean
  onToggleExpand: () => void
}

export type ToolRenderer = ComponentType<ToolRendererProps>

export type ToolRendererRegistry = Record<string, ToolRenderer>

export interface ExtensionRenderHint {
  type: 'code' | 'diff' | 'terminal' | 'table' | 'list' | 'json' | 'markdown'
  language?: string
  columns?: Array<string>
  ordered?: boolean
}

export interface ExtensionUISpec {
  root: string
  elements: Record<string, unknown>
}

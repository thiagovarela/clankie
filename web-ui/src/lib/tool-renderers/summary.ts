import {
  FilePenLine,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderTree,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ToolExecution } from '@/stores/tool-executions'

export interface ToolSummary {
  icon: LucideIcon
  command: string
}

/**
 * Extract a compact command/path summary for a tool execution.
 * Returns icon + command string for display in "tool › command" format.
 */
export function getToolCommandSummary(execution: ToolExecution): ToolSummary {
  const { toolName, args } = execution

  switch (toolName) {
    case 'bash':
      return {
        icon: Terminal,
        command: String(args.command ?? ''),
      }

    case 'read':
      return {
        icon: FileText,
        command: String(args.path ?? ''),
      }

    case 'write':
      return {
        icon: FilePlus2,
        command: String(args.path ?? ''),
      }

    case 'edit':
      return {
        icon: FilePenLine,
        command: String(args.path ?? ''),
      }

    case 'grep':
      return {
        icon: Search,
        command: String(args.pattern ?? ''),
      }

    case 'find':
      return {
        icon: FolderTree,
        command: String(args.pattern ?? '*'),
      }

    case 'ls':
      return {
        icon: FolderOpen,
        command: String(args.path ?? '.'),
      }

    default: {
      // Fallback: use first arg value or empty string
      const firstArg = Object.values(args)[0]
      return {
        icon: Wrench,
        command: firstArg ? String(firstArg) : '',
      }
    }
  }
}

/**
 * Extract text output from a tool execution result.
 */
export function getToolOutputText(execution: ToolExecution): string {
  const source = execution.result ?? execution.partialResult
  const textContent = source?.content?.find(
    (c): c is { type: 'text'; text: string } =>
      'type' in c &&
      c.type === 'text' &&
      'text' in c &&
      typeof c.text === 'string',
  )

  if (textContent?.text) {
    return textContent.text
  }

  // For edit tool, check for diff in details
  if (execution.toolName === 'edit') {
    const details = execution.result?.details as { diff?: string } | undefined
    if (details?.diff) {
      return details.diff
    }
  }

  if (source?.details) {
    return JSON.stringify(source.details, null, 2)
  }

  return execution.status === 'running' ? 'Running…' : ''
}

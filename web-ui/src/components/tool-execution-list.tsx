import { useStore } from '@tanstack/react-store'
import { ToolExecutionCard } from './tool-execution-card'
import {
  getToolExecutionsForMessage,
  toolExecutionsStore,
} from '@/stores/tool-executions'

export function ToolExecutionList({ messageId }: { messageId: string }) {
  const executions = useStore(toolExecutionsStore, (state) =>
    getToolExecutionsForMessage(messageId, state),
  )

  if (executions.length === 0) return null

  return (
    <div className="space-y-2 mb-2">
      {executions.map((execution) => (
        <ToolExecutionCard key={execution.toolCallId} execution={execution} />
      ))}
    </div>
  )
}

import { Store } from '@tanstack/store'
import { messagesStore } from '@/stores/messages'

export interface ToolResultContentText {
  type: 'text'
  text: string
}

export interface ToolExecutionResult {
  content?: Array<ToolResultContentText | Record<string, unknown>>
  details?: Record<string, unknown>
}

export interface ToolExecution {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  status: 'running' | 'completed' | 'error'
  partialResult?: ToolExecutionResult
  result?: ToolExecutionResult
  isError?: boolean
  startTime: number
  endTime?: number
  messageId: string | null
}

export interface ToolExecutionsStore {
  executions: Partial<Record<string, ToolExecution>>
  executionOrder: Array<string>
}

const INITIAL_STATE: ToolExecutionsStore = {
  executions: {},
  executionOrder: [],
}

export const toolExecutionsStore = new Store<ToolExecutionsStore>(INITIAL_STATE)

function resolveCurrentAssistantMessageId(): string | null {
  const { currentMessageId, messages } = messagesStore.state
  if (currentMessageId) return currentMessageId

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant')
  return lastAssistant?.id ?? null
}

export function startToolExecution(params: {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}): void {
  const messageId = resolveCurrentAssistantMessageId()

  toolExecutionsStore.setState((state) => ({
    ...state,
    executions: {
      ...state.executions,
      [params.toolCallId]: {
        toolCallId: params.toolCallId,
        toolName: params.toolName,
        args: params.args,
        status: 'running',
        startTime: Date.now(),
        messageId,
      },
    },
    executionOrder: state.executionOrder.includes(params.toolCallId)
      ? state.executionOrder
      : [...state.executionOrder, params.toolCallId],
  }))
}

export function updateToolExecution(
  toolCallId: string,
  partialResult: ToolExecutionResult,
): void {
  toolExecutionsStore.setState((state) => {
    const execution = state.executions[toolCallId]
    if (!execution) return state

    return {
      ...state,
      executions: {
        ...state.executions,
        [toolCallId]: {
          ...execution,
          partialResult,
        },
      },
    }
  })
}

export function finishToolExecution(params: {
  toolCallId: string
  result: ToolExecutionResult
  isError: boolean
}): void {
  toolExecutionsStore.setState((state) => {
    const execution = state.executions[params.toolCallId]
    if (!execution) return state

    return {
      ...state,
      executions: {
        ...state.executions,
        [params.toolCallId]: {
          ...execution,
          status: params.isError ? 'error' : 'completed',
          result: params.result,
          isError: params.isError,
          endTime: Date.now(),
        },
      },
    }
  })
}

export function getToolExecutionsForMessage(
  messageId: string,
  state: ToolExecutionsStore,
): Array<ToolExecution> {
  return state.executionOrder
    .map((id) => state.executions[id])
    .filter((execution): execution is ToolExecution => Boolean(execution))
    .filter((execution) => execution.messageId === messageId)
}

export function clearToolExecutions(): void {
  toolExecutionsStore.setState(() => INITIAL_STATE)
}

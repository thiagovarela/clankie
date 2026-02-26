import { Store } from '@tanstack/store'
import type { Message } from '@/lib/types'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPiToolCallBlock(block: unknown): block is {
  type: 'toolCall'
  id: string
  name: string
  arguments: unknown
} {
  return (
    isRecord(block) &&
    block.type === 'toolCall' &&
    typeof block.id === 'string' &&
    typeof block.name === 'string'
  )
}

function toHistoricalToolResult(message: Message): {
  result: ToolExecutionResult
  isError: boolean
} | null {
  if (message.role !== 'toolResult' || typeof message.toolCallId !== 'string') {
    return null
  }

  let content: ToolExecutionResult['content']
  if (typeof message.content === 'string') {
    content = [{ type: 'text', text: message.content }]
  } else if (Array.isArray(message.content)) {
    content = (message.content as Array<unknown>).filter(
      (item): item is ToolResultContentText | Record<string, unknown> =>
        isRecord(item),
    )
  }

  const details = isRecord(message.details) ? message.details : undefined

  return {
    result: {
      ...(content !== undefined ? { content } : {}),
      ...(details !== undefined ? { details } : {}),
    },
    isError: Boolean(message.isError),
  }
}

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

export function hydrateToolExecutionsFromMessages(
  messages: Array<Message>,
): void {
  console.log(
    '[tool-executions] hydrate start',
    messages.map((m, index) => ({
      index,
      role: m.role,
      contentType: Array.isArray(m.content) ? 'array' : typeof m.content,
      contentLength: Array.isArray(m.content) ? m.content.length : undefined,
      toolCallId: typeof m.toolCallId === 'string' ? m.toolCallId : undefined,
    })),
  )

  const toolResultsByCallId = new Map<
    string,
    {
      result: ToolExecutionResult
      isError: boolean
    }
  >()

  for (const message of messages) {
    const parsed = toHistoricalToolResult(message)
    if (!parsed || typeof message.toolCallId !== 'string') continue
    toolResultsByCallId.set(message.toolCallId, parsed)
  }

  console.log(
    '[tool-executions] toolResult callIds:',
    Array.from(toolResultsByCallId.keys()),
  )

  const now = Date.now()
  const executions: Partial<Record<string, ToolExecution>> = {}
  const executionOrder: Array<string> = []
  let displayMessageIndex = 0
  const unmatchedToolUses: Array<string> = []

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue

    const messageId = `msg-${displayMessageIndex}`

    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isPiToolCallBlock(block)) continue

        const historicalResult = toolResultsByCallId.get(block.id)
        const args = isRecord(block.arguments) ? block.arguments : {}

        if (!historicalResult) {
          unmatchedToolUses.push(block.id)
        }

        executions[block.id] = {
          toolCallId: block.id,
          toolName: block.name,
          args,
          status: historicalResult
            ? historicalResult.isError
              ? 'error'
              : 'completed'
            : 'completed',
          result: historicalResult?.result,
          isError: historicalResult?.isError,
          startTime: now,
          endTime: now,
          messageId,
        }

        if (!executionOrder.includes(block.id)) {
          executionOrder.push(block.id)
        }
      }
    }

    displayMessageIndex += 1
  }

  toolExecutionsStore.setState(() => ({
    executions,
    executionOrder,
  }))

  console.log('[tool-executions] hydrate complete', {
    hydratedExecutions: executionOrder.length,
    executionOrder,
    unmatchedToolUses,
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

import { describe, expect, it } from 'vitest'
import {
  clearToolExecutions,
  getToolExecutionsForMessage,
  hydrateToolExecutionsFromMessages,
  toolExecutionsStore,
} from '../tool-executions'
import type { Message } from '@/lib/types'

describe('tool executions store', () => {
  describe('hydrateToolExecutionsFromMessages', () => {
    it('restores tool executions and links them to assistant message ids', () => {
      const messages: Array<Message> = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'List files' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'ls',
              arguments: { path: '.' },
            },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'ls',
          content: [{ type: 'text', text: '.pi/' }],
          isError: false,
        },
      ]

      hydrateToolExecutionsFromMessages(messages)

      const executions = getToolExecutionsForMessage(
        'msg-1',
        toolExecutionsStore.state,
      )
      expect(executions).toHaveLength(1)
      expect(executions[0]).toMatchObject({
        toolCallId: 'call-1',
        toolName: 'ls',
        args: { path: '.' },
        status: 'completed',
        isError: false,
        messageId: 'msg-1',
      })

      const content = executions[0].result?.content as
        | Array<{ type: 'text'; text: string }>
        | undefined
      expect(content?.[0]?.text).toBe('.pi/')
    })

    it('marks execution as error when historical toolResult is_error is true', () => {
      const messages: Array<Message> = [
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-2',
              name: 'read',
              arguments: { path: '/missing.txt' },
            },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'call-2',
          toolName: 'read',
          content: [{ type: 'text', text: 'ENOENT' }],
          isError: true,
        },
      ]

      hydrateToolExecutionsFromMessages(messages)

      const execution = toolExecutionsStore.state.executions['call-2']
      expect(execution).toBeDefined()
      expect(execution?.status).toBe('error')
      expect(execution?.isError).toBe(true)
    })

    it('clears previous executions before hydrating', () => {
      hydrateToolExecutionsFromMessages([
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-old',
              name: 'ls',
              arguments: { path: '.' },
            },
          ],
        },
      ])

      hydrateToolExecutionsFromMessages([])

      expect(toolExecutionsStore.state.executionOrder).toEqual([])
      expect(toolExecutionsStore.state.executions).toEqual({})

      clearToolExecutions()
    })
  })
})

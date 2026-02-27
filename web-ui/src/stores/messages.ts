/**
 * Messages store — manages chat message history and streaming state.
 * Handles incremental token updates during assistant streaming.
 */

import { Store } from '@tanstack/store'
import type { Message, MessageContent } from '@/lib/types'

const ATTACHED_FILE_LINE_REGEX = /(?:^|\n)\[Attached: ([^\]]+)\]/g

export interface DisplayAttachment {
  type: 'image' | 'file'
  name?: string
  mimeType?: string
  previewUrl?: string
}

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
  thinkingContent?: string
  persistedThinkingContent?: string
  isThinking?: boolean
  attachments?: Array<DisplayAttachment>
}

export interface MessagesStore {
  messages: Array<DisplayMessage>
  streamingContent: string
  thinkingContent: string
  currentMessageId: string | null
}

const INITIAL_STATE: MessagesStore = {
  messages: [],
  streamingContent: '',
  thinkingContent: '',
  currentMessageId: null,
}

export const messagesStore = new Store<MessagesStore>(INITIAL_STATE)

// ─── Actions ───────────────────────────────────────────────────────────────────

export function addUserMessage(
  content: string,
  attachments?: Array<DisplayAttachment>,
): void {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  messagesStore.setState((state) => ({
    ...state,
    messages: [
      ...state.messages,
      {
        id,
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments: attachments?.length ? attachments : undefined,
      },
    ],
  }))
}

export function startAssistantMessage(): void {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  messagesStore.setState((state) => ({
    ...state,
    currentMessageId: id,
    streamingContent: '',
    messages: [
      ...state.messages,
      {
        id,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      },
    ],
  }))
}

export function appendStreamToken(accumulated: string): void {
  messagesStore.setState((state) => {
    if (!state.currentMessageId) return state

    return {
      ...state,
      streamingContent: accumulated,
      messages: state.messages.map((msg) =>
        msg.id === state.currentMessageId
          ? { ...msg, content: accumulated, isStreaming: true }
          : msg,
      ),
    }
  })
}

export function endAssistantMessage(): void {
  messagesStore.setState((state) => ({
    ...state,
    streamingContent: '',
    thinkingContent: '',
    currentMessageId: null,
    messages: state.messages
      .map((msg) =>
        msg.id === state.currentMessageId
          ? { ...msg, isStreaming: false, isThinking: false }
          : msg,
      )
      .filter((msg) => {
        if (msg.id !== state.currentMessageId || msg.role !== 'assistant') {
          return true
        }

        const hasText = msg.content.trim().length > 0
        const hasThinking = (msg.thinkingContent ?? '').trim().length > 0
        return hasText || hasThinking
      }),
  }))
}

export function startThinking(): void {
  messagesStore.setState((state) => {
    if (!state.currentMessageId) return state

    return {
      ...state,
      thinkingContent: '',
      messages: state.messages.map((msg) =>
        msg.id === state.currentMessageId ? { ...msg, isThinking: true } : msg,
      ),
    }
  })
}

export function appendThinkingToken(accumulated: string): void {
  messagesStore.setState((state) => {
    if (!state.currentMessageId) return state

    return {
      ...state,
      thinkingContent: accumulated,
      messages: state.messages.map((msg) =>
        msg.id === state.currentMessageId
          ? { ...msg, thinkingContent: accumulated }
          : msg,
      ),
    }
  })
}

export function endThinking(): void {
  messagesStore.setState((state) => {
    if (!state.currentMessageId) return state

    return {
      ...state,
      messages: state.messages.map((msg) =>
        msg.id === state.currentMessageId ? { ...msg, isThinking: false } : msg,
      ),
    }
  })
}

export function setMessages(messages: Array<Message>): void {
  // Convert pi's Message format to DisplayMessage format
  // Filter to only user and assistant messages (skip bashExecution, toolResult, etc.)
  const displayMessages: Array<DisplayMessage> = messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg, idx) => {
      let textContent = ''
      let persistedThinkingContent: string | undefined
      let attachments: Array<DisplayAttachment> = []

      // Handle different content shapes: string, array, or undefined
      if (typeof msg.content === 'string') {
        textContent = msg.content
      } else if (Array.isArray(msg.content)) {
        textContent = msg.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('\n\n')

        if (msg.role === 'assistant') {
          const thinkingBlocks = msg.content
            .filter(
              (c): c is { type: 'thinking'; thinking: string } =>
                c.type === 'thinking',
            )
            .map((c) => c.thinking)
            .join('\n\n')

          persistedThinkingContent = thinkingBlocks || undefined
        }

        if (msg.role === 'user') {
          attachments = extractImageAttachments(msg.content)
        }
      }

      if (msg.role === 'user') {
        const { content: cleanedText, attachments: fileAttachments } =
          extractFileAttachmentsFromText(textContent)
        textContent = cleanedText
        attachments = [...attachments, ...fileAttachments]
      }

      return {
        id: `msg-${idx}`,
        role: msg.role as 'user' | 'assistant',
        content: textContent,
        persistedThinkingContent,
        attachments: attachments.length > 0 ? attachments : undefined,
        timestamp: Date.now() - (messages.length - idx) * 1000, // Approximate timestamps
      }
    })
    .filter((message) => {
      if (message.role === 'user') {
        return true
      }

      const hasText = message.content.trim().length > 0
      const hasThinking =
        (message.persistedThinkingContent ?? '').trim().length > 0

      return hasText || hasThinking
    })

  messagesStore.setState((state) => ({
    ...state,
    messages: displayMessages,
  }))
}

function extractImageAttachments(
  contentBlocks: Array<MessageContent>,
): Array<DisplayAttachment> {
  return contentBlocks
    .filter(
      (
        block,
      ): block is Extract<MessageContent, { type: 'image'; data: string }> =>
        block.type === 'image',
    )
    .map((block) => ({
      type: 'image' as const,
      mimeType: block.mimeType,
      previewUrl: `data:${block.mimeType};base64,${block.data}`,
    }))
}

function extractFileAttachmentsFromText(content: string): {
  content: string
  attachments: Array<DisplayAttachment>
} {
  const matches = Array.from(content.matchAll(ATTACHED_FILE_LINE_REGEX))
  const attachments = matches.map((match) => ({
    type: 'file' as const,
    name: match[1],
  }))

  const cleanedContent = content
    .replace(ATTACHED_FILE_LINE_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    content: cleanedContent,
    attachments,
  }
}

export function clearMessages(): void {
  messagesStore.setState(() => INITIAL_STATE)
}

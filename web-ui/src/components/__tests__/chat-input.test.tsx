import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatInput } from '../chat-input'
import { clientManager } from '@/lib/client-manager'
import { messagesStore } from '@/stores/messages'
import { sessionStore } from '@/stores/session'

// Mock clientManager
vi.mock('@/lib/client-manager', () => ({
  clientManager: {
    getClient: vi.fn(),
  },
}))

// Mock window.alert
const mockAlert = vi.fn()
global.alert = mockAlert

describe('ChatInput', () => {
  const mockClient = {
    prompt: vi.fn(),
    uploadAttachment: vi.fn(),
    getCommands: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAlert.mockClear()
    mockClient.getCommands.mockResolvedValue({
      commands: [
        {
          name: 'heartbeat',
          description: 'Run heartbeat check',
          source: 'extension',
        },
      ],
    })
    ;(clientManager.getClient as any).mockReturnValue(mockClient)

    // Set up a valid session
    sessionStore.setState((state) => ({
      ...state,
      sessionId: 'test-session-123',
      isStreaming: false,
    }))

    // Clear messages
    messagesStore.setState((state) => ({
      ...state,
      messages: [],
    }))
  })

  describe('Rendering', () => {
    it('renders textarea and send button', () => {
      render(<ChatInput />)

      expect(screen.getByPlaceholderText(/Send a message/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Send message/i }),
      ).toBeInTheDocument()
    })

    it('renders attach files button', () => {
      render(<ChatInput />)

      expect(screen.getByTitle('Attach files')).toBeInTheDocument()
    })

    it('renders insert command button', () => {
      render(<ChatInput />)

      expect(screen.getByTitle('Insert command')).toBeInTheDocument()
    })

    it('renders hidden file input with correct attributes', () => {
      render(<ChatInput />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveAttribute('multiple')
      expect(fileInput).toHaveAttribute(
        'accept',
        'image/*,application/pdf,text/*',
      )
      expect(fileInput).toHaveClass('hidden')
    })

    it('renders ModelSelector inside ChatInput', () => {
      sessionStore.setState((state) => ({
        ...state,
        sessionId: 'test-session-123',
        model: {
          provider: 'anthropic',
          id: 'claude-3-5-sonnet',
          name: 'Claude 3.5 Sonnet',
          inputPrice: 0.003,
          outputPrice: 0.015,
          contextWindow: 200000,
          supportsImages: true,
          supportsPromptCache: true,
        },
      }))

      render(<ChatInput />)

      // ModelSelector should be in ChatInput now
      expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument()
    })
  })

  describe('Message input', () => {
    it('updates message state on typing', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, 'Hello, world!')

      expect(textarea).toHaveValue('Hello, world!')
    })

    it('clears message after successful send', async () => {
      const user = userEvent.setup()
      mockClient.prompt.mockResolvedValue({})

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, 'Test message')
      expect(textarea).toHaveValue('Test message')

      const sendButton = screen.getByRole('button', { name: /Send message/i })
      await user.click(sendButton)

      await waitFor(() => {
        expect(textarea).toHaveValue('')
      })
    })
  })

  describe('Keyboard shortcuts', () => {
    it('sends message on Enter', async () => {
      const user = userEvent.setup()
      mockClient.prompt.mockResolvedValue({})

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(mockClient.prompt).toHaveBeenCalledWith(
          'test-session-123',
          'Test message',
          undefined,
        )
      })
    })

    it('does not send on Shift+Enter', async () => {
      const user = userEvent.setup()
      mockClient.prompt.mockResolvedValue({})

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, 'Test message')
      await user.keyboard('{Shift>}{Enter}{/Shift}')

      // Should not have sent
      expect(mockClient.prompt).not.toHaveBeenCalled()

      // Textarea should have a newline
      expect(textarea).toHaveValue('Test message\n')
    })
  })

  describe('Slash commands', () => {
    it('shows command palette when typing slash command', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, '/')

      await waitFor(() => {
        expect(screen.getByTestId('command-palette')).toBeInTheDocument()
      })
      expect(mockClient.getCommands).toHaveBeenCalledWith('test-session-123')
    })

    it('hides command palette when text no longer matches slash trigger', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, '/abc test')

      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })

    it('hides command palette on Escape', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, '/')

      await waitFor(() => {
        expect(screen.getByTestId('command-palette')).toBeInTheDocument()
      })

      await user.keyboard('{Escape}')

      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })

    it('inserts selected command into textarea', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, '/')

      const commandItem = await screen.findByText('/heartbeat')
      await user.click(commandItem)

      expect(textarea).toHaveValue('/heartbeat ')
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })

    it('inserts slash and opens palette from toolbar button', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      await user.click(screen.getByTitle('Insert command'))

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      expect(textarea).toHaveValue('/')

      await waitFor(() => {
        expect(screen.getByTestId('command-palette')).toBeInTheDocument()
      })
    })
  })

  describe('Disabled states', () => {
    it('disables inputs when no sessionId', () => {
      sessionStore.setState((state) => ({
        ...state,
        sessionId: null,
      }))

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      const sendButton = screen.getByRole('button', { name: /Send message/i })
      const attachButton = screen.getByTitle('Attach files')

      expect(textarea).toBeDisabled()
      expect(sendButton).toBeDisabled()
      expect(attachButton).toBeDisabled()
    })

    it('disables inputs when streaming', () => {
      sessionStore.setState((state) => ({
        ...state,
        sessionId: 'test-session-123',
        isStreaming: true,
      }))

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      const sendButton = screen.getByRole('button', { name: /Send message/i })
      const attachButton = screen.getByTitle('Attach files')

      expect(textarea).toBeDisabled()
      expect(sendButton).toBeDisabled()
      expect(attachButton).toBeDisabled()
    })

    it('disables send button when message is empty and no attachments', () => {
      render(<ChatInput />)

      const sendButton = screen.getByRole('button', { name: /Send message/i })
      expect(sendButton).toBeDisabled()
    })

    it('enables send button when message is not empty', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      const sendButton = screen.getByRole('button', { name: /Send message/i })

      expect(sendButton).toBeDisabled()

      await user.type(textarea, 'Hello')
      expect(sendButton).not.toBeDisabled()
    })
  })

  describe('Message sending', () => {
    it('sends text-only message', async () => {
      const user = userEvent.setup()
      mockClient.prompt.mockResolvedValue({})

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, 'Hello, AI!')

      const sendButton = screen.getByRole('button', { name: /Send message/i })
      await user.click(sendButton)

      await waitFor(() => {
        expect(mockClient.prompt).toHaveBeenCalledWith(
          'test-session-123',
          'Hello, AI!',
          undefined,
        )
      })

      // Message should be added to store
      expect(messagesStore.state.messages).toHaveLength(1)
      expect(messagesStore.state.messages[0].content).toBe('Hello, AI!')
    })

    it('trims whitespace from message before sending', async () => {
      const user = userEvent.setup()
      mockClient.prompt.mockResolvedValue({})

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, '  Hello  ')

      const sendButton = screen.getByRole('button', { name: /Send message/i })
      await user.click(sendButton)

      await waitFor(() => {
        expect(mockClient.prompt).toHaveBeenCalledWith(
          'test-session-123',
          'Hello',
          undefined,
        )
      })
    })

    it('does not send when message is only whitespace', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, '   ')

      const sendButton = screen.getByRole('button', { name: /Send message/i })

      // Button should still be disabled
      expect(sendButton).toBeDisabled()
    })

    it('handles send error gracefully', async () => {
      const user = userEvent.setup()
      mockClient.prompt.mockRejectedValue(new Error('Network error'))

      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, 'Test message')

      const sendButton = screen.getByRole('button', { name: /Send message/i })
      await user.click(sendButton)

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to send message:',
          expect.any(Error),
        )
      })

      consoleError.mockRestore()
    })

    it('focuses textarea after send', async () => {
      const user = userEvent.setup()
      mockClient.prompt.mockResolvedValue({})

      render(<ChatInput />)

      const textarea = screen.getByPlaceholderText(/Send a message/i)
      await user.type(textarea, 'Test')

      const sendButton = screen.getByRole('button', { name: /Send message/i })
      await user.click(sendButton)

      await waitFor(() => {
        expect(document.activeElement).toBe(textarea)
      })
    })
  })

  describe('Drag and drop', () => {
    it('shows drag indicator on drag over', async () => {
      render(<ChatInput />)

      // Find the container by looking for the drag-drop wrapper
      const container = document.querySelector('[class*="absolute bottom-0"]')
      expect(container).toBeInTheDocument()

      await act(async () => {
        fireEvent.dragOver(container!, {
          dataTransfer: {
            files: [],
          },
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Drop files here')).toBeInTheDocument()
      })
    })

    it('hides drag indicator on drag leave', async () => {
      render(<ChatInput />)

      const container = document.querySelector('[class*="absolute bottom-0"]')
      expect(container).toBeInTheDocument()

      await act(async () => {
        fireEvent.dragOver(container!, {
          dataTransfer: {
            files: [],
          },
        })
      })

      await waitFor(() => {
        expect(screen.getByText('Drop files here')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.dragLeave(container!, {
          dataTransfer: {
            files: [],
          },
        })
      })

      await waitFor(() => {
        expect(screen.queryByText('Drop files here')).not.toBeInTheDocument()
      })
    })
  })

  describe('File input interaction', () => {
    it('opens file picker when attach button is clicked', async () => {
      const user = userEvent.setup()
      render(<ChatInput />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      const clickSpy = vi.spyOn(fileInput, 'click')

      const attachButton = screen.getByTitle('Attach files')
      await user.click(attachButton)

      expect(clickSpy).toHaveBeenCalled()
      clickSpy.mockRestore()
    })
  })
})

/*
 * NOTE: File upload with FileReader integration tests
 *
 * Full file upload flow tests (with actual FileReader, base64 encoding,
 * and attachment rendering) are challenging to test reliably in jsdom
 * due to the async nature of FileReader and DOM timing issues.
 *
 * These scenarios are better covered by:
 * 1. E2E tests (Playwright/Cypress) that run in a real browser
 * 2. Integration tests that mock the entire file processing pipeline
 *
 * What we've tested above:
 * - UI rendering and state management
 * - Message input and submission
 * - Keyboard shortcuts
 * - Disabled states
 * - Drag/drop UI indicators
 * - Error handling
 *
 * What should be tested in E2E:
 * - Actual file selection and upload
 * - Image preview generation
 * - File size validation alerts
 * - Attachment removal
 * - Sending messages with attachments
 */

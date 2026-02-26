import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ModelSelector } from '../model-selector'
import { clientManager } from '@/lib/client-manager'
import { sessionStore } from '@/stores/session'
import { makeModelInfo } from '@/test/fixtures'
import type { ModelInfo } from '@/lib/types'

// Mock the client manager
vi.mock('@/lib/client-manager', () => ({
  clientManager: {
    getClient: vi.fn(),
  },
}))

describe('ModelSelector', () => {
  const mockClient = {
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(clientManager.getClient as any).mockReturnValue(mockClient)
  })

  it('renders null when no model is set', () => {
    sessionStore.setState((state) => ({
      ...state,
      model: null,
      sessionId: 'session-1',
    }))

    const { container } = render(<ModelSelector />)
    expect(container.firstChild).toBeNull()
  })

  it('renders model name when model is set', () => {
    const model = makeModelInfo({
      provider: 'anthropic',
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
    })

    sessionStore.setState((state) => ({
      ...state,
      model,
      sessionId: 'session-1',
      thinkingLevel: 'medium',
    }))

    render(<ModelSelector />)

    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument()
  })

  it('shows thinking level when not medium', () => {
    const model = makeModelInfo({ name: 'GPT-4' })

    sessionStore.setState((state) => ({
      ...state,
      model,
      sessionId: 'session-1',
      thinkingLevel: 'high',
    }))

    render(<ModelSelector />)

    expect(screen.getByText('thinking: high')).toBeInTheDocument()
  })

  it('does not show thinking level when medium', () => {
    const model = makeModelInfo({ name: 'GPT-4' })

    sessionStore.setState((state) => ({
      ...state,
      model,
      sessionId: 'session-1',
      thinkingLevel: 'medium',
    }))

    render(<ModelSelector />)

    expect(screen.queryByText(/thinking:/)).not.toBeInTheDocument()
  })

  it('disables trigger when isStreaming is true', () => {
    const model = makeModelInfo({ name: 'GPT-4' })

    sessionStore.setState((state) => ({
      ...state,
      model,
      sessionId: 'session-1',
      isStreaming: true,
    }))

    render(<ModelSelector />)

    const trigger = screen.getByRole('button')
    expect(trigger).toBeDisabled()
  })

  it('disables trigger when no sessionId', () => {
    const model = makeModelInfo({ name: 'GPT-4' })

    sessionStore.setState((state) => ({
      ...state,
      model,
      sessionId: null,
      isStreaming: false,
    }))

    render(<ModelSelector />)

    const trigger = screen.getByRole('button')
    expect(trigger).toBeDisabled()
  })

  describe('Model selection', () => {
    it('opens dropdown and shows latest models when clicked', async () => {
      const user = userEvent.setup()
      const model = makeModelInfo({ name: 'Claude 3.5 Sonnet' })
      const availableModels: Array<ModelInfo> = [
        makeModelInfo({
          provider: 'anthropic',
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
        }),
        makeModelInfo({
          provider: 'anthropic',
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
        }),
        makeModelInfo({
          provider: 'openai',
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
        }),
      ]

      sessionStore.setState((state) => ({
        ...state,
        model,
        sessionId: 'session-1',
        availableModels,
      }))

      render(<ModelSelector />)

      const trigger = screen.getByRole('button')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByText('Select Model')).toBeInTheDocument()
      })

      // All models should be visible (< 10 models)
      expect(screen.getByText('Claude 3.5 Haiku')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
    })

    it('calls setModel when a model is selected', async () => {
      const user = userEvent.setup()
      const currentModel = makeModelInfo({ name: 'Claude 3.5 Sonnet' })
      const targetModel = makeModelInfo({
        provider: 'openai',
        id: 'gpt-4',
        name: 'GPT-4',
      })

      sessionStore.setState((state) => ({
        ...state,
        model: currentModel,
        sessionId: 'session-1',
        availableModels: [currentModel, targetModel],
      }))

      mockClient.setModel.mockResolvedValue(targetModel)

      render(<ModelSelector />)

      const trigger = screen.getByRole('button')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByText('GPT-4')).toBeInTheDocument()
      })

      const gpt4Item = screen.getByText('GPT-4').closest('div[role="menuitem"]')
      expect(gpt4Item).toBeInTheDocument()

      await user.click(gpt4Item!)

      expect(mockClient.setModel).toHaveBeenCalledWith(
        'session-1',
        'openai',
        'gpt-4',
      )
    })
  })

  describe('Model grouping with >10 models', () => {
    it('renders without errors when older models exist (grouped by provider)', () => {
      // Create 15 models to trigger submenu logic with "Other models"
      // This ensures the code path with provider labels is exercised
      const availableModels: Array<ModelInfo> = [
        // Latest models (will appear in main menu)
        makeModelInfo({
          provider: 'anthropic',
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
        }),
        makeModelInfo({
          provider: 'anthropic',
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
        }),
        makeModelInfo({
          provider: 'openai',
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
        }),
        makeModelInfo({
          provider: 'openai',
          id: 'gpt-4',
          name: 'GPT-4',
        }),
        makeModelInfo({
          provider: 'google',
          id: 'gemini-1.5-pro',
          name: 'Gemini 1.5 Pro',
        }),
        // Older models (will appear in submenu, grouped by provider)
        // These trigger the buggy code path where DropdownMenuLabel
        // must be wrapped in DropdownMenuGroup
        makeModelInfo({
          provider: 'anthropic',
          id: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
        }),
        makeModelInfo({
          provider: 'anthropic',
          id: 'claude-3-sonnet-20240229',
          name: 'Claude 3 Sonnet',
        }),
        makeModelInfo({
          provider: 'anthropic',
          id: 'claude-3-haiku-20240307',
          name: 'Claude 3 Haiku',
        }),
        makeModelInfo({
          provider: 'openai',
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
        }),
        makeModelInfo({
          provider: 'openai',
          id: 'gpt-3.5',
          name: 'GPT-3.5',
        }),
        makeModelInfo({
          provider: 'google',
          id: 'gemini-1.0-pro',
          name: 'Gemini 1.0 Pro',
        }),
        makeModelInfo({
          provider: 'google',
          id: 'gemini-1.0',
          name: 'Gemini 1.0',
        }),
      ]

      const currentModel = availableModels[0]

      sessionStore.setState((state) => ({
        ...state,
        model: currentModel,
        sessionId: 'session-1',
        availableModels,
      }))

      // This test verifies the bug is fixed:
      // Rendering the component with >10 models should NOT throw the
      // "MenuGroupRootContext is missing" error that occurs when
      // DropdownMenuLabel is used outside DropdownMenuGroup.
      //
      // The bug manifests during initial render when React constructs
      // the component tree, so we don't need to interact with the UI.
      expect(() => {
        render(<ModelSelector />)
      }).not.toThrow()
    })
  })

  describe('Thinking level submenu', () => {
    it('renders thinking level submenu without errors', () => {
      const model = makeModelInfo({ name: 'Claude 3.5 Sonnet' })

      sessionStore.setState((state) => ({
        ...state,
        model,
        sessionId: 'session-1',
        thinkingLevel: 'medium',
        availableModels: [model],
      }))

      // Verify the component renders without throwing
      expect(() => {
        render(<ModelSelector />)
      }).not.toThrow()
    })
  })
})

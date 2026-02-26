import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { AuthLoginDialog } from '../auth-login-dialog'
import { clientManager } from '@/lib/client-manager'
import { authStore } from '@/stores/auth'
import type { LoginFlowState } from '@/stores/auth'

// Mock clientManager
vi.mock('@/lib/client-manager', () => ({
  clientManager: {
    getClient: vi.fn(),
  },
}))

// Mock window.open
const mockWindowOpen = vi.fn()
global.window.open = mockWindowOpen

describe('AuthLoginDialog', () => {
  const mockClient = {
    authLoginCancel: vi.fn(),
    authLoginInput: vi.fn(),
  }

  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockWindowOpen.mockClear()
    mockOnOpenChange.mockClear()
    ;(clientManager.getClient as any).mockReturnValue(mockClient)

    // Clear auth store
    authStore.setState(() => ({
      providers: [],
      isLoadingProviders: false,
      loginFlow: null,
    }))
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('Rendering', () => {
    it('renders null when loginFlow is null', () => {
      authStore.setState((state) => ({
        ...state,
        loginFlow: null,
      }))

      const { container } = render(
        <AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />,
      )

      // Should render nothing
      expect(container.firstChild).toBeNull()
    })

    it('renders dialog when open and loginFlow exists', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'idle',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText('Sign in to github')).toBeInTheDocument()
    })
  })

  describe('Status: idle', () => {
    it('shows starting login state', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'idle',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByText('Starting login...')).toBeInTheDocument()
      // Should have a loading spinner
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('shows cancel button in idle state', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'idle',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
    })
  })

  describe('Status: waiting_url', () => {
    it('shows OAuth URL waiting state', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(
        screen.getByText(/Complete the authentication in your browser/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Open in Browser/i }),
      ).toBeInTheDocument()
    })

    it('shows instructions when provided', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
        instructions: 'Please authorize the app in the browser',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(
        screen.getByText('Please authorize the app in the browser'),
      ).toBeInTheDocument()
    })

    it('shows manual input when showManualInput is true', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
        showManualInput: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(
        screen.getByText(/Or paste the authorization code/i),
      ).toBeInTheDocument()
      expect(
        screen.getByPlaceholderText(/Paste code or redirect URL/i),
      ).toBeInTheDocument()
    })

    it('shows progress message when provided', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
        progressMessage: 'Waiting for authorization...',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(
        screen.getByText('Waiting for authorization...'),
      ).toBeInTheDocument()
    })

    it('auto-opens URL in new tab', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://github.com/login/oauth/authorize',
        '_blank',
      )
    })

    it('does not auto-open URL twice for same URL', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      const { rerender } = render(
        <AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />,
      )

      expect(mockWindowOpen).toHaveBeenCalledTimes(1)

      // Rerender with same flow
      rerender(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      // Should not open again
      expect(mockWindowOpen).toHaveBeenCalledTimes(1)
    })

    it('opens URL manually when button clicked', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      mockWindowOpen.mockClear() // Clear the auto-open call

      const openButton = screen.getByRole('button', {
        name: /Open in Browser/i,
      })

      await act(async () => {
        fireEvent.click(openButton)
      })

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://github.com/login/oauth/authorize',
        '_blank',
      )
    })
  })

  describe('Status: waiting_input', () => {
    it('shows prompt input form', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_input',
        promptMessage: 'Enter your verification code',
        promptPlaceholder: '000000',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(
        screen.getByText('Enter your verification code'),
      ).toBeInTheDocument()
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument()
    })

    it('submits prompt value when form submitted', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_input',
        promptMessage: 'Enter your verification code',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const input = screen.getByPlaceholderText(
        'Enter value',
      ) as HTMLInputElement
      const submitButton = screen.getByRole('button', { name: /submit/i })

      await act(async () => {
        fireEvent.change(input, { target: { value: '123456' } })
        fireEvent.click(submitButton)
      })

      expect(mockClient.authLoginInput).toHaveBeenCalledWith(
        'flow-123',
        '123456',
      )
    })

    it('trims whitespace from prompt value', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_input',
        promptMessage: 'Enter your verification code',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const input = screen.getByPlaceholderText(
        'Enter value',
      ) as HTMLInputElement
      const submitButton = screen.getByRole('button', { name: /submit/i })

      await act(async () => {
        fireEvent.change(input, { target: { value: '  123456  ' } })
        fireEvent.click(submitButton)
      })

      expect(mockClient.authLoginInput).toHaveBeenCalledWith(
        'flow-123',
        '123456',
      )
    })
  })

  describe('Status: in_progress', () => {
    it('shows in progress state', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'in_progress',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(
        screen.getByText('Completing authentication...'),
      ).toBeInTheDocument()
    })

    it('shows custom progress message when provided', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'in_progress',
        progressMessage: 'Exchanging tokens...',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByText('Exchanging tokens...')).toBeInTheDocument()
    })
  })

  describe('Status: complete (success)', () => {
    it('shows success state', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'complete',
        success: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByText('Login Successful')).toBeInTheDocument()
      expect(
        screen.getByText(/Successfully authenticated with github/i),
      ).toBeInTheDocument()
    })

    it('shows close button instead of cancel', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'complete',
        success: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /cancel/i }),
      ).not.toBeInTheDocument()
    })

    it('auto-closes dialog after 1.5 seconds', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'complete',
        success: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      // Should not be called immediately
      expect(mockOnOpenChange).not.toHaveBeenCalled()

      // Fast-forward 1.5 seconds
      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('clears auto-close timer on unmount', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'complete',
        success: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      const { unmount } = render(
        <AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />,
      )

      // Unmount before timer fires
      unmount()

      // Fast-forward past timer
      vi.advanceTimersByTime(2000)

      // Should not call onOpenChange after unmount
      expect(mockOnOpenChange).not.toHaveBeenCalled()
    })
  })

  describe('Status: error', () => {
    it('shows error state', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'error',
        error: 'Invalid credentials',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByText('Login Failed')).toBeInTheDocument()
      expect(screen.getByText('Authentication failed')).toBeInTheDocument()
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })

    it('shows close button in error state', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'error',
        error: 'Network error',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    })

    it('shows error when complete with success=false', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'complete',
        success: false,
        error: 'User denied access',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      expect(screen.getByText('Authentication failed')).toBeInTheDocument()
      expect(screen.getByText('User denied access')).toBeInTheDocument()
    })
  })

  describe('Cancel behavior', () => {
    it('calls authLoginCancel when cancel clicked in active flow', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })

      await act(async () => {
        fireEvent.click(cancelButton)
      })

      expect(mockClient.authLoginCancel).toHaveBeenCalledWith('flow-123')
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('does not call authLoginCancel when flow is complete', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'complete',
        success: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const closeButton = screen.getByRole('button', { name: /close/i })

      await act(async () => {
        fireEvent.click(closeButton)
      })

      expect(mockClient.authLoginCancel).not.toHaveBeenCalled()
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('does not call authLoginCancel when flow is in error state', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'error',
        error: 'Network error',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const closeButton = screen.getByRole('button', { name: /close/i })

      await act(async () => {
        fireEvent.click(closeButton)
      })

      expect(mockClient.authLoginCancel).not.toHaveBeenCalled()
    })
  })

  describe('Manual code input', () => {
    it('submits manual code when form submitted', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
        showManualInput: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const input = screen.getByPlaceholderText(
        /Paste code or redirect URL/i,
      ) as HTMLInputElement
      const submitButton = screen.getAllByRole('button', { name: /submit/i })[0]

      await act(async () => {
        fireEvent.change(input, { target: { value: 'abc123xyz' } })
        fireEvent.click(submitButton)
      })

      expect(mockClient.authLoginInput).toHaveBeenCalledWith(
        'flow-123',
        'abc123xyz',
      )
    })

    it('trims whitespace from manual code', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
        showManualInput: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const input = screen.getByPlaceholderText(
        /Paste code or redirect URL/i,
      ) as HTMLInputElement
      const submitButton = screen.getAllByRole('button', { name: /submit/i })[0]

      await act(async () => {
        fireEvent.change(input, { target: { value: '  abc123  ' } })
        fireEvent.click(submitButton)
      })

      expect(mockClient.authLoginInput).toHaveBeenCalledWith(
        'flow-123',
        'abc123',
      )
    })

    it('does not submit empty manual code', async () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'waiting_url',
        url: 'https://github.com/login/oauth/authorize',
        showManualInput: true,
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      render(<AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />)

      const submitButton = screen.getAllByRole('button', { name: /submit/i })[0]

      await act(async () => {
        fireEvent.click(submitButton)
      })

      expect(mockClient.authLoginInput).not.toHaveBeenCalled()
    })
  })

  describe('Clear flow on close', () => {
    it('clears login flow when dialog closed', () => {
      const loginFlow: LoginFlowState = {
        loginFlowId: 'flow-123',
        providerId: 'github',
        status: 'idle',
      }

      authStore.setState((state) => ({
        ...state,
        loginFlow,
      }))

      const { rerender } = render(
        <AuthLoginDialog open={true} onOpenChange={mockOnOpenChange} />,
      )

      expect(authStore.state.loginFlow).toBeTruthy()

      // Close dialog
      rerender(<AuthLoginDialog open={false} onOpenChange={mockOnOpenChange} />)

      // Flow should be cleared
      expect(authStore.state.loginFlow).toBeNull()
    })
  })
})

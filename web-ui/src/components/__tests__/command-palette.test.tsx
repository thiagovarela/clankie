import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../command-palette'
import { clientManager } from '@/lib/client-manager'
import { sessionStore } from '@/stores/session'

vi.mock('@/lib/client-manager', () => ({
  clientManager: {
    getClient: vi.fn(),
  },
}))

describe('CommandPalette', () => {
  const mockGetCommands = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    sessionStore.setState((state) => ({
      ...state,
      sessionId: 'test-session-123',
      isStreaming: false,
    }))

    mockGetCommands.mockResolvedValue({
      commands: [
        {
          name: 'heartbeat',
          description: 'Run periodic health checks',
          source: 'extension',
        },
        {
          name: 'docs',
          description: 'Open docs prompt template',
          source: 'prompt',
        },
        {
          name: 'skill:frontend-design',
          description: 'Build polished frontend UIs',
          source: 'skill',
        },
      ],
    })
    ;(clientManager.getClient as any).mockReturnValue({
      getCommands: mockGetCommands,
    })
  })

  it('renders grouped command results', async () => {
    render(<CommandPalette open search="" onSelect={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('/heartbeat')).toBeInTheDocument()
      expect(screen.getByText('/docs')).toBeInTheDocument()
      expect(screen.getByText('/skill:frontend-design')).toBeInTheDocument()
    })

    expect(screen.getByText('Extensions')).toBeInTheDocument()
    expect(screen.getByText('Prompt Templates')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('filters commands by search term', async () => {
    render(<CommandPalette open search="heart" onSelect={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('/heartbeat')).toBeInTheDocument()
    })

    expect(screen.queryByText('/docs')).not.toBeInTheDocument()
    expect(screen.queryByText('/skill:frontend-design')).not.toBeInTheDocument()
  })

  it('calls onSelect with command name', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<CommandPalette open search="" onSelect={onSelect} />)

    const item = await screen.findByText('/heartbeat')
    await user.click(item)

    expect(onSelect).toHaveBeenCalledWith('heartbeat')
  })

  it('shows empty state when no command matches search', async () => {
    render(<CommandPalette open search="not-found" onSelect={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No commands found.')).toBeInTheDocument()
    })
  })
})

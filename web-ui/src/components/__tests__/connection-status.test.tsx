/**
 * Tests for ConnectionStatus component — displays connection state from store.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectionStatus } from '../connection-status'
import { updateConnectionStatus } from '@/stores/connection'

describe('ConnectionStatus', () => {
  it('shows "Connected" badge when connected', () => {
    updateConnectionStatus('connected')

    render(<ConnectionStatus />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('shows "Connecting..." badge when connecting', () => {
    updateConnectionStatus('connecting')

    render(<ConnectionStatus />)

    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('shows "Disconnected" badge when disconnected', () => {
    updateConnectionStatus('disconnected')

    render(<ConnectionStatus />)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('shows error message when status is error', () => {
    updateConnectionStatus('error', 'Connection failed')

    render(<ConnectionStatus />)

    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('shows "Connection error" when status is error but no specific message', () => {
    updateConnectionStatus('error')

    render(<ConnectionStatus />)

    expect(screen.getByText('Connection error')).toBeInTheDocument()
  })

  it('shows spinner icon when connecting', () => {
    updateConnectionStatus('connecting')

    const { container } = render(<ConnectionStatus />)

    // Look for animate-spin class
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('does not show spinner when connected', () => {
    updateConnectionStatus('connected')

    const { container } = render(<ConnectionStatus />)

    const spinner = container.querySelector('.animate-spin')
    expect(spinner).not.toBeInTheDocument()
  })
})

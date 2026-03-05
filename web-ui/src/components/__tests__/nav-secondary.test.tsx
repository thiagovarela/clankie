import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { NavSecondary } from '../nav-secondary'
import { SidebarProvider } from '@/components/ui/sidebar'

// Mock tanstack router
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useRouterState: () => ({
      location: { pathname: '/settings/theme' },
    }),
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

// A simple wrapper that provides the SidebarProvider
function renderWithSidebar(ui: React.ReactElement) {
  return render(
    <SidebarProvider>
      {ui}
    </SidebarProvider>
  )
}

describe('NavSecondary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders settings button', () => {
    renderWithSidebar(<NavSecondary />)

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('opens dropdown when settings button is clicked', async () => {
    const user = userEvent.setup()
    renderWithSidebar(<NavSecondary />)

    const settingsButton = screen.getByRole('button')
    await user.click(settingsButton)

    // All settings items should be visible
    await waitFor(() => {
      expect(screen.getByText('Appearance')).toBeInTheDocument()
    })

    expect(screen.getByText('Connection')).toBeInTheDocument()
    expect(screen.getByText('Auth')).toBeInTheDocument()
    expect(screen.getByText('Scoped Models')).toBeInTheDocument()
    expect(screen.getByText('Extensions')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('renders settings links with correct hrefs', async () => {
    const user = userEvent.setup()
    renderWithSidebar(<NavSecondary />)

    const settingsButton = screen.getByRole('button')
    await user.click(settingsButton)

    await waitFor(() => {
      const appearanceLink = screen.getByText('Appearance').closest('a')
      expect(appearanceLink).toHaveAttribute('href', '/settings/theme')

      const connectionLink = screen.getByText('Connection').closest('a')
      expect(connectionLink).toHaveAttribute('href', '/settings/connection')

      const authLink = screen.getByText('Auth').closest('a')
      expect(authLink).toHaveAttribute('href', '/settings/auth')

      const scopedModelsLink = screen.getByText('Scoped Models').closest('a')
      expect(scopedModelsLink).toHaveAttribute('href', '/settings/scoped-models')

      const extensionsLink = screen.getByText('Extensions').closest('a')
      expect(extensionsLink).toHaveAttribute('href', '/settings/extensions')

      const skillsLink = screen.getByText('Skills').closest('a')
      expect(skillsLink).toHaveAttribute('href', '/settings/skills')
    })
  })

  it('shows active state when in settings route', () => {
    renderWithSidebar(<NavSecondary />)

    const button = screen.getByRole('button')
    // The button should have isActive prop applied which sets data-active attribute
    expect(button).toHaveAttribute('data-active')
  })
})

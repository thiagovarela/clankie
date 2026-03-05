import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import appCss from '../styles.css?url'
import { AppSidebar } from '@/components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { clientManager } from '@/lib/client-manager'
import {
  connectionStore,
  enableCookieAuth,
  updateConnectionSettings,
} from '@/stores/connection'
import { ExtensionUIProvider } from '@/components/extension-ui/provider'
import { initializeTheme, themeStore } from '@/stores/theme'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'clankie — Personal AI Assistant',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
    ],
  }),

  component: RootComponent,
})

function RootComponent() {
  // Initialize theme on mount
  useEffect(() => {
    initializeTheme()

    // Subscribe to theme changes for system mode
    const subscription = themeStore.subscribe((state: { mode: string }) => {
      if (state.mode === 'system') {
        // Re-initialize to set up system preference listener
        initializeTheme()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Auto-detect cookie auth and auto-connect
  useEffect(() => {
    async function checkCookieAuth() {
      if (typeof window === 'undefined') return

      // Get the WebSocket URL from settings to determine the API base URL
      const { settings } = connectionStore.state
      const wsUrl = settings.url
      // Convert ws:// to http:// for API calls
      const apiBase = wsUrl.replace(/^ws/, 'http').replace(/\/$/, '')

      try {
        // Check if cookie auth is valid
        const response = await fetch(`${apiBase}/api/auth/check`, {
          credentials: 'include', // Include cookies in the request
        })

        if (response.ok) {
          const data = await response.json()
          if (data.authenticated) {
            // Cookie auth is valid - enable it
            console.log('[root] Cookie auth is active')
            enableCookieAuth()
            // Connect using cookie auth
            if (!clientManager.isConnected()) {
              clientManager.connect()
            }
            return
          }
        }
      } catch (err) {
        // API call failed (probably cross-origin or server doesn't support it)
        console.log('[root] Cookie auth check failed:', err)
      }

      // Fall back to token-based auth
      // Check for ?token= query parameter
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')

      if (token) {
        // Save token to connection store (persists to localStorage)
        updateConnectionSettings({ authToken: token })

        // Strip token from URL to avoid it lingering in browser history/address bar
        window.history.replaceState(null, '', window.location.pathname)

        console.log(
          '[root] Detected auth token from URL, saved to localStorage',
        )
      }

      // Auto-connect if auth token is configured
      const { settings: currentSettings } = connectionStore.state
      if (currentSettings.authToken && !clientManager.isConnected()) {
        clientManager.connect()
      }
    }

    checkCookieAuth()
  }, [])

  return (
    <RootDocument>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar variant="inset" />
          <SidebarInset className="relative">
            {/* Mobile sidebar trigger - positioned absolute */}
            <div className="absolute left-4 top-3.5 z-50 md:hidden">
              <SidebarTrigger />
            </div>
            <Outlet />
          </SidebarInset>
          <ExtensionUIProvider />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  // Theme is applied client-side via initializeTheme()
  // Avoid SSR mismatch by not setting className here
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

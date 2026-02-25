import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { MessageSquare, Settings } from 'lucide-react'
import { ConnectionStatus } from '@/components/connection-status'

import appCss from '../styles.css?url'

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
        title: 'clankie — Web UI',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <div className="flex h-screen flex-col">
        <header className="border-b border-border bg-card">
          <div className="flex h-14 items-center gap-4 px-4">
            <h1 className="text-lg font-semibold">clankie</h1>
            
            <nav className="flex gap-2">
              <Link
                to="/"
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent [&.active]:bg-accent"
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </Link>
              <Link
                to="/settings"
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent [&.active]:bg-accent"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </nav>

            <div className="ml-auto">
              <ConnectionStatus />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

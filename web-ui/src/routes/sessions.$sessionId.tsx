import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Settings } from 'lucide-react'
import { useEffect } from 'react'
import { ChatInput } from '@/components/chat-input'
import { ChatMessages } from '@/components/chat-messages'
import { Button } from '@/components/ui/button'
import { clientManager } from '@/lib/client-manager'
import { connectionStore } from '@/stores/connection'
import { sessionStore } from '@/stores/session'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionPage,
})

function SessionPage() {
  const { sessionId: urlSessionId } = Route.useParams()
  const navigate = useNavigate()

  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { sessionId: activeSessionId } = useStore(sessionStore, (state) => ({
    sessionId: state.sessionId,
  }))

  // Ensure sessions are loaded (we don't need the value, just the subscription)
  useStore(sessionsListStore, (state) => state)

  const isConnected = status === 'connected'

  // When URL sessionId changes, switch to that session
  useEffect(() => {
    if (!isConnected) return

    // If the active session is already the URL session, nothing to do
    if (activeSessionId === urlSessionId) {
      console.log(
        `[session-page] Already on session ${urlSessionId}, no switch needed`,
      )
      return
    }

    console.log(
      `[session-page] URL sessionId changed to ${urlSessionId}, switching...`,
    )
    clientManager.switchSession(urlSessionId).catch((err) => {
      console.error(
        `[session-page] Failed to load session ${urlSessionId}:`,
        err,
      )
      // Redirect to index on error
      navigate({ to: '/' })
    })
  }, [urlSessionId, isConnected, activeSessionId, navigate])

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center chat-background">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-2">
            <Settings className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Not Connected</h2>
            <p className="text-muted-foreground">
              Configure your connection to get started
            </p>
          </div>
          <Link to="/settings">
            <Button className="transition-transform hover:scale-105 active:scale-95">
              <Settings className="mr-2 h-4 w-4" />
              Go to Settings
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Show loading state while session is being loaded
  if (activeSessionId !== urlSessionId) {
    return (
      <div className="flex h-full items-center justify-center chat-background">
        <div className="text-center space-y-3">
          <div className="inline-flex gap-1 mb-2">
            <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
            <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
            <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Loading session{' '}
            <span className="font-mono text-primary">
              {urlSessionId.slice(0, 8)}
            </span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ChatMessages />
      <ChatInput />
    </div>
  )
}

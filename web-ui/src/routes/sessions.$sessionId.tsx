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
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Not Connected</h2>
            <p className="text-muted-foreground">
              Configure your connection to get started
            </p>
          </div>
          <Link to="/settings">
            <Button>
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
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading session {urlSessionId}...
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

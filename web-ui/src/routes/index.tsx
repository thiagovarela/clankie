import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Settings } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { connectionStore } from '@/stores/connection'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/')({
  component: IndexPage,
})

function IndexPage() {
  const navigate = useNavigate()

  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { activeSessionId } = useStore(sessionsListStore, (state) => ({
    activeSessionId: state.activeSessionId,
  }))

  const isConnected = status === 'connected'

  // Redirect to active session when available
  useEffect(() => {
    if (!isConnected) return

    if (activeSessionId) {
      console.log(`[index] Redirecting to active session: ${activeSessionId}`)
      navigate({
        to: '/sessions/$sessionId',
        params: { sessionId: activeSessionId },
      })
    }
  }, [activeSessionId, isConnected, navigate])

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

  // Show loading state while waiting for initial session
  return (
    <div className="flex h-full items-center justify-center chat-background">
      <div className="text-center space-y-3">
        <div className="inline-flex gap-1 mb-2">
          <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
          <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
          <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
        </div>
        <p className="text-sm text-muted-foreground">Loading sessions...</p>
      </div>
    </div>
  )
}

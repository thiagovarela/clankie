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

  // Show loading state while waiting for initial session
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center space-y-2">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
        <p className="text-sm text-muted-foreground">Loading sessions...</p>
      </div>
    </div>
  )
}

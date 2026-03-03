import { Link } from '@tanstack/react-router'
import { Plus, Settings } from 'lucide-react'
import { ConnectionStatus } from './connection-status'
import { ModelSelector } from './model-selector'
import { Button } from '@/components/ui/button'
import { clientManager } from '@/lib/client-manager'

export function ChatTopbar() {
  const handleCreateChat = async () => {
    try {
      const sessionId = await clientManager.createNewSession()
      if (sessionId) {
        // Navigate to the new session
        window.location.href = `/sessions/${sessionId}`
      }
    } catch (error) {
      console.error('[chat-topbar] Failed to create new session:', error)
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/50 bg-background/80 backdrop-blur-md px-4 sticky top-0 z-30">
      {/* Left: New chat button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCreateChat}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Chat</span>
        </Button>
      </div>

      {/* Center: Model selector */}
      <div className="flex-1 flex justify-center">
        <ModelSelector />
      </div>

      {/* Right: Connection status + settings */}
      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <Link to="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </Link>
      </div>
    </header>
  )
}

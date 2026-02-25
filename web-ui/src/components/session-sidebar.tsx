import { useStore } from '@tanstack/react-store'
import { MessageSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { sessionsListStore } from '@/stores/sessions-list'
import { clientManager } from '@/lib/client-manager'
import { cn } from '@/lib/utils'

export function SessionSidebar() {
  const { sessions, activeSessionId } = useStore(
    sessionsListStore,
    (state) => ({
      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
    }),
  )

  const handleNewChat = async () => {
    await clientManager.createNewSession()
  }

  const handleSelectSession = (sessionId: string) => {
    if (sessionId === activeSessionId) return
    clientManager.switchSession(sessionId)
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="p-4">
        <Button onClick={handleNewChat} className="w-full" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
            <MessageSquare className="h-8 w-8 text-sidebar-foreground/50 mb-2" />
            <p className="text-sm text-sidebar-foreground/70">
              No sessions yet
            </p>
            <p className="text-xs text-sidebar-foreground/50">
              Click "New Chat" to start
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => handleSelectSession(session.sessionId)}
                className={cn(
                  'w-full rounded-md p-3 text-left transition-colors',
                  'hover:bg-sidebar-accent',
                  session.sessionId === activeSessionId
                    ? 'bg-sidebar-accent'
                    : 'bg-transparent',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">
                      {session.title || 'New chat'}
                    </p>
                  </div>
                  {session.messageCount > 0 && (
                    <span className="text-xs text-sidebar-foreground/50 shrink-0">
                      {session.messageCount}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

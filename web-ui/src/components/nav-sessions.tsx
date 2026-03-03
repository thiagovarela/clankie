import { useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { MoreHorizontalIcon, Trash2Icon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  getSortedSessions,
  removeSession,
  sessionsListStore,
} from '@/stores/sessions-list'
import { cn } from '@/lib/utils'

function formatSessionDate(timestamp?: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

export function NavRecentSessions() {
  const navigate = useNavigate()
  const { isMobile } = useSidebar()
  const { sessions, activeSessionId } = useStore(
    sessionsListStore,
    (state) => ({
      sessions: state.sessions ?? [],
      activeSessionId: state.activeSessionId,
    }),
  )

  const handleSwitchSession = (sessionId: string) => {
    navigate({ to: '/sessions/$sessionId', params: { sessionId } })
  }

  const handleDeleteSession = (sessionId: string) => {
    removeSession(sessionId)
  }

  // Show only last 15 sessions, sorted by most recent
  const recentSessions = getSortedSessions(sessions || []).slice(0, 15)

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden py-2">
      <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50 px-3 py-2">
        Recent
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0.5 px-2">
        {recentSessions.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton disabled className="h-12 opacity-40">
              <span className="text-sm text-sidebar-foreground/40">No sessions yet</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : (
          recentSessions.map((session) => (
            <SidebarMenuItem key={session.sessionId}>
              <SidebarMenuButton
                isActive={session.sessionId === activeSessionId}
                onClick={() => handleSwitchSession(session.sessionId)}
                className={cn(
                  "h-auto py-2.5 px-3 group/item relative overflow-hidden flex-col items-start gap-0.5",
                  session.sessionId === activeSessionId
                    ? 'bg-primary/10 text-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40'
                )}
              >
                {/* Active indicator bar */}
                {session.sessionId === activeSessionId && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full" />
                )}
                
                {/* Title */}
                <span className={cn(
                  "w-full truncate text-sm leading-tight",
                  session.sessionId === activeSessionId && "font-medium text-foreground"
                )}>
                  {session.title || 'New Chat'}
                </span>
                
                {/* Date */}
                <span className="text-[11px] text-muted-foreground/50">
                  {formatSessionDate(session.updatedAt)}
                </span>
              </SidebarMenuButton>
              
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuAction
                      showOnHover
                      className="h-7 w-7 top-2 right-1 aria-expanded:bg-sidebar-accent"
                    />
                  }
                >
                  <MoreHorizontalIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">More</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-32"
                  side={isMobile ? 'bottom' : 'right'}
                  align={isMobile ? 'end' : 'start'}
                >
                  <DropdownMenuItem
                    onClick={() => handleSwitchSession(session.sessionId)}
                  >
                    <span>Open</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => handleDeleteSession(session.sessionId)}
                  >
                    <Trash2Icon className="h-3.5 w-3.5 mr-2" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          ))
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}

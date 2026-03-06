import { useNavigate } from '@tanstack/react-router'
import { CirclePlusIcon } from 'lucide-react'
import type * as React from 'react'
import { NavSecondary } from '@/components/nav-secondary'
import { NavRecentSessions } from '@/components/nav-sessions'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { clientManager } from '@/lib/client-manager'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate()
  const { setOpenMobile, isMobile } = useSidebar()

  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const handleGoHome = () => {
    closeMobileSidebar()
    navigate({ to: '/' })
  }

  const handleCreateChat = async () => {
    try {
      const sessionId = await clientManager.createNewSession()
      if (sessionId) {
        closeMobileSidebar()
        navigate({ to: '/sessions/$sessionId', params: { sessionId } })
      }
    } catch (error) {
      console.error('[app-sidebar] Failed to create new session:', error)
    }
  }

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-border/20"
      {...props}
    >
      <SidebarHeader className="gap-3 px-4 py-4">
        {/* Brand row */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="h-10" onClick={handleGoHome}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/15 border border-primary/20">
                  <span className="text-sm font-mono font-bold text-primary">
                    c/
                  </span>
                </div>
                <span className="text-lg font-mono font-semibold tracking-tight text-sidebar-foreground">
                  clankie
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* New Chat button - fixed in header */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New Chat"
              className="h-10 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground transition-all rounded-xl"
              onClick={handleCreateChat}
            >
              <CirclePlusIcon className="h-4 w-4 mr-1" />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-2 px-2 py-2">
        <NavRecentSessions />
      </SidebarContent>

      <SidebarFooter className="px-2 py-2">
        <NavSecondary />
      </SidebarFooter>
    </Sidebar>
  )
}

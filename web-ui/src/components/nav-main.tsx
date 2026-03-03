import { useNavigate } from '@tanstack/react-router'
import { CirclePlusIcon } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { clientManager } from '@/lib/client-manager'

export function NavMain() {
  const navigate = useNavigate()

  const handleCreateChat = async () => {
    try {
      const sessionId = await clientManager.createNewSession()
      if (sessionId) {
        navigate({ to: '/sessions/$sessionId', params: { sessionId } })
      }
    } catch (error) {
      console.error('[nav-main] Failed to create new session:', error)
    }
  }

  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
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
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

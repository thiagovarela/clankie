import { Link, useRouterState } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useState } from 'react'
import {
  Bell,
  Filter,
  Globe,
  KeyRound,
  Palette,
  Puzzle,
  Settings,
  Sparkles,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  getUnreadCount,
  notificationsStore,
} from '@/stores/notifications'

const settingsLinks = [
  { to: '/settings/theme', label: 'Appearance', icon: Palette },
  { to: '/settings/connection', label: 'Connection', icon: Globe },
  { to: '/settings/auth', label: 'Auth', icon: KeyRound },
  { to: '/settings/scoped-models', label: 'Scoped Models', icon: Filter },
  { to: '/settings/extensions', label: 'Extensions', icon: Puzzle },
  { to: '/settings/skills', label: 'Skills', icon: Sparkles },
]

export function NavSecondary() {
  const { location } = useRouterState()
  const currentPath = location.pathname
  const isInSettings = currentPath.startsWith('/settings')
  const isInNotifications = currentPath === '/notifications'
  const { isMobile, setOpenMobile } = useSidebar()
  const [open, setOpen] = useState(false)

  const unreadCount = useStore(notificationsStore, getUnreadCount)

  const handleNavigate = () => {
    setOpen(false)
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <SidebarMenu>
      {/* Notifications */}
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isInNotifications}
          className="h-10 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-xl"
        >
          <Link to="/notifications" onClick={handleNavigate}>
            <div className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
            </div>
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="ml-auto text-xs font-medium text-primary">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                isActive={isInSettings}
                className="h-10 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-xl"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align={isMobile ? 'end' : 'start'}
            className="w-48"
          >
            {settingsLinks.map((link) => {
              const Icon = link.icon
              return (
                <DropdownMenuItem
                  key={link.to}
                  render={<Link to={link.to} />}
                  className="h-9 text-sm"
                  onClick={handleNavigate}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  <span>{link.label}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

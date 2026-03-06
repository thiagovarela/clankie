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
import { cn } from '@/lib/utils'
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
          isActive={isInNotifications}
          className={cn(
            "h-10 text-sm rounded-xl transition-colors",
            unreadCount > 0
              ? "text-sidebar-foreground font-medium bg-primary/10 hover:bg-primary/20"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
          )}
          render={
            <Link to="/notifications" onClick={handleNavigate}>
              <div className="relative flex items-center justify-center w-4">
                <Bell className={cn("h-4 w-4", unreadCount > 0 && "text-primary")} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
                    <span className="text-[10px] font-bold text-primary-foreground leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  </span>
                )}
              </div>
              <span>Notifications</span>
            </Link>
          }
        />
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

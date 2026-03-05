import { Link, useRouterState } from '@tanstack/react-router'
import {
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

const settingsLinks = [
  { to: '/settings/theme', label: 'Appearance', icon: Palette },
  { to: '/settings/connection', label: 'Connection', icon: Globe },
  { to: '/settings/auth', label: 'Auth', icon: KeyRound },
  { to: '/settings/extensions', label: 'Extensions', icon: Puzzle },
  { to: '/settings/skills', label: 'Skills', icon: Sparkles },
]

export function NavSecondary() {
  const { location } = useRouterState()
  const currentPath = location.pathname
  const isInSettings = currentPath.startsWith('/settings')
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
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

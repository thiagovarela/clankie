import { Link, useRouterState } from '@tanstack/react-router'
import {
  ChevronDown,
  Globe,
  KeyRound,
  Puzzle,
  Settings,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import type * as React from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

const settingsLinks = [
  { to: '/settings/connection', label: 'Connection', icon: Globe },
  { to: '/settings/auth', label: 'Auth', icon: KeyRound },
  { to: '/settings/extensions', label: 'Extensions', icon: Puzzle },
  { to: '/settings/skills', label: 'Skills', icon: Sparkles },
]

export function NavSecondary({
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  // Connection status is now shown in the topbar, not in the sidebar

  const { location } = useRouterState()
  const currentPath = location.pathname
  const isInSettings = currentPath.startsWith('/settings')
  const [settingsOpen, setSettingsOpen] = useState(isInSettings)

  return (
    <SidebarGroup {...props} className="px-2">
      <SidebarGroupContent>
        <SidebarMenu>
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton>
                  <Settings />
                  <span>Settings</span>
                  <ChevronDown
                    className={`ml-auto h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {settingsLinks.map((link) => {
                    const Icon = link.icon
                    const isActive = currentPath === link.to
                    return (
                      <SidebarMenuSubItem key={link.to}>
                        <SidebarMenuSubButton
                          render={<Link to={link.to} />}
                          isActive={isActive}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{link.label}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

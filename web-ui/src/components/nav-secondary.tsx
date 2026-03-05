import { Link, useRouterState } from '@tanstack/react-router'
import {
  ChevronDown,
  Globe,
  KeyRound,
  Palette,
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
  { to: '/settings/theme', label: 'Appearance', icon: Palette },
  { to: '/settings/connection', label: 'Connection', icon: Globe },
  { to: '/settings/auth', label: 'Auth', icon: KeyRound },
  { to: '/settings/extensions', label: 'Extensions', icon: Puzzle },
  { to: '/settings/skills', label: 'Skills', icon: Sparkles },
]

export function NavSecondary({
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { location } = useRouterState()
  const currentPath = location.pathname
  const isInSettings = currentPath.startsWith('/settings')
  const [settingsOpen, setSettingsOpen] = useState(isInSettings)

  return (
    <SidebarGroup {...props} className="px-2 py-2">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton className="h-10 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-xl">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                  <ChevronDown
                    className={`ml-auto h-4 w-4 transition-transform text-muted-foreground/50 ${settingsOpen ? 'rotate-180' : ''}`}
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="gap-1 py-1">
                  {settingsLinks.map((link) => {
                    const Icon = link.icon
                    const isActive = currentPath === link.to
                    return (
                      <SidebarMenuSubItem key={link.to}>
                        <SidebarMenuSubButton
                          render={<Link to={link.to} />}
                          isActive={isActive}
                          className="h-9 text-xs rounded-lg"
                        >
                          <Icon className="h-3.5 w-3.5" />
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

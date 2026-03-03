'use client'

import { Link, useRouterState } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
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
import { Badge } from '@/components/ui/badge'
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
import { connectionStore } from '@/stores/connection'

const settingsLinks = [
  { to: '/settings/connection', label: 'Connection', icon: Globe },
  { to: '/settings/auth', label: 'Auth', icon: KeyRound },
  { to: '/settings/extensions', label: 'Extensions', icon: Puzzle },
  { to: '/settings/skills', label: 'Skills', icon: Sparkles },
]

export function NavSecondary({
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { location } = useRouterState()
  const currentPath = location.pathname
  const isInSettings = currentPath.startsWith('/settings')
  const [settingsOpen, setSettingsOpen] = useState(isInSettings)

  const connectionConfig = {
    connected: {
      label: 'Connected',
      variant: 'default' as const,
      className: 'bg-green-500/10 text-green-500 border-green-500/20',
      dotColor: 'bg-green-500',
    },
    connecting: {
      label: 'Connecting',
      variant: 'secondary' as const,
      className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      dotColor: 'bg-yellow-500',
    },
    disconnected: {
      label: 'Disconnected',
      variant: 'secondary' as const,
      className: 'bg-red-500/10 text-red-500 border-red-500/20',
      dotColor: 'bg-red-500',
    },
    error: {
      label: 'Error',
      variant: 'destructive' as const,
      className: 'bg-red-500/10 text-red-500 border-red-500/20',
      dotColor: 'bg-red-500',
    },
  }[status]

  return (
    <SidebarGroup {...props}>
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
          <SidebarMenuItem>
            <div className="px-2 py-1.5">
              <Badge
                variant={connectionConfig.variant}
                className={`${connectionConfig.className} w-full justify-start`}
              >
                <div
                  className={`size-2 rounded-full mr-2 ${connectionConfig.dotColor} ${status === 'connected' ? 'animate-breathe' : ''}`}
                />
                {connectionConfig.label}
              </Badge>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

'use client'

import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Settings, Puzzle } from 'lucide-react'
import { connectionStore } from '@/stores/connection'

export function NavSecondary({
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

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
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/settings" />}>
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/extensions" />}>
              <Puzzle />
              <span>Extensions</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="px-2 py-1.5">
              <Badge
                variant={connectionConfig.variant}
                className={`${connectionConfig.className} w-full justify-start`}
              >
                <div
                  className={`size-2 rounded-full mr-2 ${connectionConfig.dotColor}`}
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

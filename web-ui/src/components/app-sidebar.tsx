import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import type * as React from 'react'
import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import { NavRecentSessions } from '@/components/nav-sessions'
import { Input } from '@/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar 
      collapsible="offcanvas" 
      {...props}
    >
      <SidebarHeader className="gap-3 px-3 py-3 border-b border-sidebar-border/30">
        {/* Brand row */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              size="lg" 
              render={<Link to="/" />}
              className="h-9"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 border border-primary/20">
                  <span className="text-sm font-mono font-bold text-primary">
                    c/
                  </span>
                </div>
                <span className="text-base font-mono font-semibold tracking-tight text-sidebar-foreground/90">
                  clankie
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Search input - Tau-style search-first */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search sessions..."
            className="h-9 pl-9 text-sm bg-sidebar-accent/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 placeholder:text-muted-foreground/40"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 py-3">
        <NavMain />
        <NavRecentSessions />
        <NavSecondary className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}

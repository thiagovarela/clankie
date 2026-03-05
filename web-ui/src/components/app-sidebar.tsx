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
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
            <SidebarMenuButton
              size="lg"
              render={<Link to="/" />}
              className="h-10"
            >
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

        {/* Search input - Tau-style search-first */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            placeholder="Search sessions..."
            className="h-10 pl-10 text-sm bg-sidebar-accent/50 border-0 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/30 placeholder:text-muted-foreground/40"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-2 px-2 py-2">
        <NavMain />
        <NavRecentSessions />
      </SidebarContent>

      <SidebarFooter className="px-2 py-2">
        <NavSecondary />
      </SidebarFooter>
    </Sidebar>
  )
}

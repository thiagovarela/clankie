import { Link, useRouterState } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useCallback, useEffect, useState } from 'react'
import {
  Bell,
  Download,
  Filter,
  Globe,
  KeyRound,
  Palette,
  Package,
  Puzzle,
  Settings,
  Sparkles,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { extensionsStore, setExtensions, setLoading } from '@/stores/extensions'
import { sessionsListStore } from '@/stores/sessions-list'
import { connectionStore } from '@/stores/connection'
import { clientManager } from '@/lib/client-manager'
import { deriveExtensionDisplayName, getExtensionCategory } from '@/lib/extension-utils'

const settingsLinks = [
  { to: '/settings/theme', label: 'Appearance', icon: Palette },
  { to: '/settings/connection', label: 'Connection', icon: Globe },
  { to: '/settings/auth', label: 'Auth', icon: KeyRound },
  { to: '/settings/scoped-models', label: 'Scoped Models', icon: Filter },
  { to: '/settings/skills', label: 'Skills', icon: Sparkles },
]

export function NavSecondary() {
  const { location } = useRouterState()
  const currentPath = location.pathname
  const isInSettings = currentPath.startsWith('/settings')
  const isInNotifications = currentPath === '/notifications'
  const isInExtensions = currentPath.startsWith('/extensions')
  const { isMobile, setOpenMobile } = useSidebar()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [extensionsMenuOpen, setExtensionsMenuOpen] = useState(false)

  const unreadCount = useStore(notificationsStore, getUnreadCount)

  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { activeSessionId } = useStore(sessionsListStore, (state) => ({
    activeSessionId: state.activeSessionId,
  }))

  const { extensions } = useStore(extensionsStore, (state) => ({
    extensions: state.extensions,
  }))

  const isConnected = status === 'connected'

  // Load extensions when connected
  const loadExtensions = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId) return

    setLoading(true)
    try {
      const { extensions: extList, errors } = await client.getExtensions(activeSessionId)
      setExtensions(extList, errors)
    } catch (err) {
      console.error('Failed to load extensions:', err)
    } finally {
      setLoading(false)
    }
  }, [activeSessionId])

  useEffect(() => {
    if (isConnected && activeSessionId && extensions.length === 0) {
      loadExtensions()
    }
  }, [isConnected, activeSessionId, extensions.length, loadExtensions])

  const handleNavigate = () => {
    setSettingsOpen(false)
    setExtensionsMenuOpen(false)
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // Get package extensions (non-built-in) for the menu
  const packageExtensions = extensions.filter((ext) => {
    const category = getExtensionCategory(ext)
    return category === 'packages' || category === 'local'
  })

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

      {/* Extensions Dropdown */}
      <SidebarMenuItem>
        <DropdownMenu open={extensionsMenuOpen} onOpenChange={setExtensionsMenuOpen}>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                isActive={isInExtensions}
                className="h-10 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-xl"
              >
                <Puzzle className="h-4 w-4" />
                <span>Extensions</span>
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align={isMobile ? 'end' : 'start'}
            className="w-56"
          >
            <DropdownMenuItem
              render={<Link to="/extensions/install" />}
              className="h-9 text-sm"
              onClick={handleNavigate}
            >
              <Download className="h-4 w-4 mr-2" />
              <span>Install</span>
            </DropdownMenuItem>

            {packageExtensions.length > 0 && <DropdownMenuSeparator />}

            {packageExtensions.map((ext) => {
              const displayName = deriveExtensionDisplayName(ext.path, ext.resolvedPath)
              const encodedPath = encodeURIComponent(ext.path)

              return (
                <DropdownMenuItem
                  key={ext.path}
                  render={
                    <Link
                      to="/extensions/$extensionId"
                      params={{ extensionId: encodedPath }}
                    />
                  }
                  className="h-9 text-sm"
                  onClick={handleNavigate}
                >
                  <Package className="h-4 w-4 mr-2" />
                  <span className="truncate">{displayName}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {/* Settings Dropdown */}
      <SidebarMenuItem>
        <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
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

import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Info,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { clientManager } from '@/lib/client-manager'
import { cn } from '@/lib/utils'
import {
  dismissAllNotifications,
  dismissNotification,
  getActiveNotifications,
  getNotificationsByDate,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsStore,
} from '@/stores/notifications'

export const Route = createFileRoute('/notifications')({
  component: NotificationsPage,
})

function NotificationsPage() {
  const { notifications, isLoading } = useStore(
    notificationsStore,
    (state) => ({
      notifications: getActiveNotifications(state),
      isLoading: state.isLoading,
    }),
  )

  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())

  const handleMarkRead = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id))
    try {
      await clientManager.getClient()?.markNotificationRead(id)
      markNotificationRead(id)
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await clientManager.getClient()?.markAllNotificationsRead()
      markAllNotificationsRead()
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }

  const handleDismiss = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id))
    try {
      await clientManager.getClient()?.dismissNotification(id)
      dismissNotification(id)
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleDismissAll = async () => {
    try {
      await clientManager.getClient()?.dismissAllNotifications()
      dismissAllNotifications()
    } catch (err) {
      console.error('Failed to dismiss all:', err)
    }
  }

  const groupedNotifications = getNotificationsByDate(notifications)

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-card/80 backdrop-blur-sm px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Notifications</h1>
              <p className="text-xs text-muted-foreground">
                {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-8 text-xs"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Mark all read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismissAll}
              className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear all
            </Button>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Clock className="h-5 w-5 animate-spin" />
                </div>
                <span className="text-sm">Loading notifications...</span>
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState />
          ) : (
            groupedNotifications.map((group) => (
              <section key={group.date} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group.date}
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                <div className="space-y-2">
                  {group.notifications.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      isProcessing={processingIds.has(notification.id)}
                      onMarkRead={() => handleMarkRead(notification.id)}
                      onDismiss={() => handleDismiss(notification.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

interface NotificationCardProps {
  notification: ReturnType<typeof getActiveNotifications>[number]
  isProcessing: boolean
  onMarkRead: () => void
  onDismiss: () => void
}

function NotificationCard({
  notification,
  isProcessing,
  onMarkRead,
  onDismiss,
}: NotificationCardProps) {
  const timeAgo = formatTimeAgo(notification.timestamp)

  const config = {
    info: {
      Icon: Info,
      iconColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      borderColor: 'border-l-blue-500',
      glowColor: 'shadow-blue-500/10',
    },
    warning: {
      Icon: AlertTriangle,
      iconColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
      borderColor: 'border-l-amber-500',
      glowColor: 'shadow-amber-500/10',
    },
    error: {
      Icon: AlertCircle,
      iconColor: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      borderColor: 'border-l-red-500',
      glowColor: 'shadow-red-500/10',
    },
    success: {
      Icon: Check,
      iconColor: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      borderColor: 'border-l-green-500',
      glowColor: 'shadow-green-500/10',
    },
  }[notification.type]

  const { Icon, iconColor, bgColor, borderColor, glowColor } = config

  const CardWrapper = notification.actionUrl ? Link : 'div'
  const wrapperProps = notification.actionUrl
    ? { to: notification.actionUrl }
    : {}

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        'border-0 shadow-sm hover:shadow-md',
        isProcessing && 'opacity-50',
        !notification.read && cn('border-l-[3px]', borderColor, 'shadow-sm', glowColor),
        notification.read && 'border-l-[3px] border-l-transparent',
        notification.actionUrl && 'cursor-pointer hover:translate-x-0.5',
      )}
    >
      {/* Unread indicator dot */}
      {!notification.read && (
        <div className="absolute top-3 right-3">
          <span className={cn('flex h-2 w-2 rounded-full', iconColor.replace('text-', 'bg-'))}>
            <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', iconColor.replace('text-', 'bg-'))} />
            <span className={cn('relative inline-flex rounded-full h-2 w-2', iconColor.replace('text-', 'bg-'))} />
          </span>
        </div>
      )}

      <CardWrapper {...wrapperProps}>
        <CardContent className={cn('p-4', bgColor)}>
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                'bg-white/80 dark:bg-black/20 shadow-sm',
              )}
            >
              <Icon className={cn('h-5 w-5', iconColor)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className={cn(
                    'font-semibold text-sm leading-tight',
                    !notification.read && 'text-foreground',
                    notification.read && 'text-foreground/80',
                  )}>
                    {notification.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {notification.message}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-background/80"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onMarkRead()
                      }}
                      disabled={isProcessing}
                      title="Mark as read"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onDismiss()
                    }}
                    disabled={isProcessing}
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground/80">
                <span className="font-medium">{timeAgo}</span>
                <span className="text-muted-foreground/40">•</span>
                <span className="capitalize">{notification.source}</span>
                {notification.sessionId && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="font-mono text-[10px] opacity-60">
                      {notification.sessionId.slice(0, 8)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </CardWrapper>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 shadow-inner">
          <Bell className="h-10 w-10 text-muted-foreground/50" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 shadow-sm">
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-2 leading-relaxed">
        No notifications to show. We'll let you know when something important happens,
        like task completions, errors, or system events.
      </p>
    </div>
  )
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// Required import for createFileRoute
import { createFileRoute } from '@tanstack/react-router'

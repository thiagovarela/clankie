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
    <div className="flex h-full flex-col chat-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-8"
            >
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Mark all read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismissAll}
              className="h-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear all
            </Button>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 animate-spin" />
                <span>Loading notifications...</span>
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState />
          ) : (
            groupedNotifications.map((group) => (
              <div key={group.date} className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground px-1">
                  {group.date}
                </h2>
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
              </div>
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

  const Icon = {
    info: Info,
    warning: AlertTriangle,
    error: AlertCircle,
    success: Check,
  }[notification.type]

  const iconColor = {
    info: 'text-blue-500',
    warning: 'text-amber-500',
    error: 'text-red-500',
    success: 'text-green-500',
  }[notification.type]

  const bgColor = {
    info: 'bg-blue-500/10',
    warning: 'bg-amber-500/10',
    error: 'bg-red-500/10',
    success: 'bg-green-500/10',
  }[notification.type]

  const CardWrapper = notification.actionUrl ? Link : 'div'
  const wrapperProps = notification.actionUrl
    ? { to: notification.actionUrl }
    : {}

  return (
    <Card
      className={cn(
        'relative transition-opacity',
        isProcessing && 'opacity-50',
        !notification.read && 'border-l-4 border-l-primary',
        notification.actionUrl && 'cursor-pointer hover:bg-muted/50',
      )}
    >
      <CardWrapper {...wrapperProps}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                bgColor,
              )}
            >
              <Icon className={cn('h-5 w-5', iconColor)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-sm">{notification.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {notification.message}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
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
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
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
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">{timeAgo}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {notification.source}
                </span>
                {notification.sessionId && (
                  <>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs font-mono text-muted-foreground">
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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Bell className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">No notifications</h3>
      <p className="text-sm text-muted-foreground max-w-xs mt-1">
        You're all caught up! Notifications from heartbeat checks, cron jobs,
        and other events will appear here.
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
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// Required import for createFileRoute
import { createFileRoute } from '@tanstack/react-router'

/**
 * Notifications store — manages app notification state.
 *
 * Notifications are persisted server-side and delivered in real-time
 * via WebSocket. This store manages the local cache and UI state.
 */

import { Store } from '@tanstack/store'
import type { AppNotification } from '@/lib/types'

export interface NotificationsStore {
  notifications: Array<AppNotification>
  isLoading: boolean
  error?: string
}

const INITIAL_STATE: NotificationsStore = {
  notifications: [],
  isLoading: false,
}

export const notificationsStore = new Store<NotificationsStore>(INITIAL_STATE)

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Set the full notifications list (used for initial load)
 */
export function setNotifications(notifications: Array<AppNotification>): void {
  notificationsStore.setState(() => ({
    notifications,
    isLoading: false,
  }))
}

/**
 * Add a single notification (used for real-time pushes)
 */
export function addNotification(notification: AppNotification): void {
  notificationsStore.setState((state) => {
    // Check for duplicate by id
    if (state.notifications.some((n) => n.id === notification.id)) {
      return state
    }
    return {
      ...state,
      notifications: [notification, ...state.notifications],
    }
  })
}

/**
 * Mark a notification as read
 */
export function markNotificationRead(id: string): void {
  notificationsStore.setState((state) => ({
    ...state,
    notifications: state.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    ),
  }))
}

/**
 * Mark all notifications as read
 */
export function markAllNotificationsRead(): void {
  notificationsStore.setState((state) => ({
    ...state,
    notifications: state.notifications.map((n) => ({ ...n, read: true })),
  }))
}

/**
 * Dismiss a notification (soft delete)
 */
export function dismissNotification(id: string): void {
  notificationsStore.setState((state) => ({
    ...state,
    notifications: state.notifications.filter((n) => n.id !== id),
  }))
}

/**
 * Dismiss all notifications
 */
export function dismissAllNotifications(): void {
  notificationsStore.setState((state) => ({
    ...state,
    notifications: [],
  }))
}

/**
 * Set loading state
 */
export function setNotificationsLoading(isLoading: boolean): void {
  notificationsStore.setState((state) => ({ ...state, isLoading }))
}

/**
 * Set error state
 */
export function setNotificationsError(error: string | undefined): void {
  notificationsStore.setState((state) => ({ ...state, error }))
}

/**
 * Reset store (e.g., on logout)
 */
export function resetNotifications(): void {
  notificationsStore.setState(() => INITIAL_STATE)
}

// ─── Selectors ───────────────────────────────────────────────────────────────

/**
 * Get count of unread notifications
 */
export function getUnreadCount(state: NotificationsStore): number {
  return state.notifications.filter((n) => !n.read && !n.dismissed).length
}

/**
 * Get non-dismissed notifications sorted by timestamp (newest first)
 */
export function getActiveNotifications(
  state: NotificationsStore,
): Array<AppNotification> {
  return state.notifications
    .filter((n) => !n.dismissed)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
}

/**
 * Get notifications grouped by date
 */
export function getNotificationsByDate(
  notifications: Array<AppNotification>,
): Array<{ date: string; notifications: Array<AppNotification> }> {
  const groups = new Map<string, Array<AppNotification>>()

  for (const notification of notifications) {
    const date = new Date(notification.timestamp).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(notification)
  }

  return Array.from(groups.entries())
    .map(([date, notifications]) => ({ date, notifications }))
    .sort(
      (a, b) =>
        new Date(b.notifications[0].timestamp).getTime() -
        new Date(a.notifications[0].timestamp).getTime(),
    )
}

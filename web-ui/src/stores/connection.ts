/**
 * Connection store — manages WebSocket connection settings and state.
 * Persists settings to localStorage.
 */

import { Store } from '@tanstack/store'
import type { ConnectionState } from '@/lib/ws-client'

export interface ConnectionSettings {
  url: string
  authToken: string
  /** When true, use cookie-based auth instead of localStorage token */
  useCookieAuth: boolean
}

export interface ConnectionStore {
  settings: ConnectionSettings
  status: ConnectionState
  error?: string
}

/**
 * Get default WebSocket URL based on current page location.
 * If served from the daemon (same-origin), auto-detects the correct URL.
 * Otherwise, falls back to localhost:3100 for development.
 */
function getDefaultUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3100'

  // Auto-detect based on current page's protocol and host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host

  // If we're on the default dev port (3000), assume daemon is on 3100
  if (host.startsWith('localhost:3000') || host.startsWith('127.0.0.1:3000')) {
    return 'ws://localhost:3100'
  }

  // Otherwise, assume same-origin (daemon serves the web-ui)
  return `${protocol}//${host}`
}

const DEFAULT_SETTINGS: ConnectionSettings = {
  url: getDefaultUrl(),
  authToken: '',
  useCookieAuth: false,
}

// Load settings from localStorage
function loadSettings(): ConnectionSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS

  try {
    const saved = localStorage.getItem('clankie-connection')
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (err) {
    console.error('Failed to load connection settings:', err)
  }

  return DEFAULT_SETTINGS
}

// Save settings to localStorage
function saveSettings(settings: ConnectionSettings): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem('clankie-connection', JSON.stringify(settings))
  } catch (err) {
    console.error('Failed to save connection settings:', err)
  }
}

export const connectionStore = new Store<ConnectionStore>({
  settings: loadSettings(),
  status: 'disconnected',
  error: undefined,
})

// ─── Actions ───────────────────────────────────────────────────────────────────

export function updateConnectionSettings(
  settings: Partial<ConnectionSettings>,
): void {
  connectionStore.setState((state) => {
    const updated = { ...state.settings, ...settings }
    saveSettings(updated)
    return {
      ...state,
      settings: updated,
    }
  })
}

export function updateConnectionStatus(
  status: ConnectionState,
  error?: string,
): void {
  connectionStore.setState((state) => ({
    ...state,
    status,
    error,
  }))
}

export function resetConnectionError(): void {
  connectionStore.setState((state) => ({
    ...state,
    error: undefined,
  }))
}

/**
 * Enable cookie-based authentication mode.
 * This is called when /api/auth/check returns authenticated: true.
 * When enabled, the client uses cookies for WebSocket auth instead of localStorage.
 */
export function enableCookieAuth(): void {
  connectionStore.setState((state) => {
    // Enable cookie auth, clear the stored token (it's now in the cookie)
    const updated = { ...state.settings, useCookieAuth: true }
    // Don't save to localStorage - cookie auth doesn't need it
    return {
      ...state,
      settings: updated,
    }
  })
}

/**
 * Disable cookie-based authentication mode and optionally clear the cookie.
 * If clearCookie is true, calls /api/auth/logout to clear the server-side cookie.
 */
export async function disableCookieAuth(clearCookie: boolean): Promise<void> {
  if (clearCookie) {
    try {
      const settings = connectionStore.state.settings
      const apiUrl = settings.url.replace(/^ws/, 'http').replace(/\/$/, '')
      await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST' })
    } catch (err) {
      console.error('[connection] Failed to clear auth cookie:', err)
    }
  }

  connectionStore.setState((state) => {
    const updated = { ...state.settings, useCookieAuth: false }
    saveSettings(updated)
    return {
      ...state,
      settings: updated,
    }
  })
}

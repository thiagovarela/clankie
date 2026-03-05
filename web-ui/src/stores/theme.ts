/**
 * Theme store — manages selected theme and color mode with localStorage persistence
 */

import { Store } from '@tanstack/store'
import type { ThemeDefinition } from '@/lib/theme-catalog'
import { DEFAULT_THEME_ID, THEMES, isValidThemeId } from '@/lib/theme-catalog'

export type ColorMode = 'light' | 'dark' | 'system'

export interface ThemeStore {
  themeId: string
  mode: ColorMode
}

const STORAGE_KEY = 'clankie-theme'

const DEFAULT_STATE: ThemeStore = {
  themeId: DEFAULT_THEME_ID,
  mode: 'dark',
}

function loadState(): ThemeStore {
  if (typeof window === 'undefined') return DEFAULT_STATE

  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ThemeStore>
      const themeId = isValidThemeId(parsed.themeId || '')
        ? parsed.themeId
        : DEFAULT_THEME_ID
      const mode = ['light', 'dark', 'system'].includes(parsed.mode || '')
        ? (parsed.mode as ColorMode)
        : 'dark'
      return { themeId: themeId || DEFAULT_THEME_ID, mode }
    }
  } catch (err) {
    console.error('[theme] Failed to load theme from localStorage:', err)
  }

  return DEFAULT_STATE
}

function saveState(state: ThemeStore): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    console.error('[theme] Failed to save theme to localStorage:', err)
  }
}

export const themeStore = new Store<ThemeStore>(loadState())

// ─── Actions ─────────────────────────────────────────────────────────────────

export function setThemeId(themeId: string): void {
  if (!isValidThemeId(themeId)) {
    console.warn('[theme] Invalid theme id:', themeId)
    return
  }

  themeStore.setState((state) => {
    const updated = { ...state, themeId }
    saveState(updated)
    return updated
  })

  // Apply theme immediately
  applyTheme(themeId)
}

export function setColorMode(mode: ColorMode): void {
  themeStore.setState((state) => {
    const updated = { ...state, mode }
    saveState(updated)
    return updated
  })

  // Apply mode immediately
  applyColorMode(mode)
}

export function getCurrentTheme(): ThemeDefinition {
  const { themeId } = themeStore.state
  return THEMES.find((t) => t.id === themeId) || THEMES[0]
}

// ─── DOM Application ─────────────────────────────────────────────────────────

/**
 * Apply theme CSS variables to document root
 */
export function applyTheme(themeId: string): void {
  if (typeof document === 'undefined') return

  const theme = THEMES.find((t) => t.id === themeId)
  if (!theme) {
    console.warn('[theme] Theme not found:', themeId)
    return
  }

  const root = document.documentElement
  root.setAttribute('data-theme', themeId)
}

/**
 * Apply color mode to document
 * - 'light': force light mode
 * - 'dark': force dark mode
 * - 'system': use system preference
 */
export function applyColorMode(mode: ColorMode): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  // Remove existing mode classes
  root.classList.remove('light', 'dark')

  if (mode === 'system') {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    root.classList.add(prefersDark ? 'dark' : 'light')
  } else {
    root.classList.add(mode)
  }
}

/**
 * Initialize theme on app mount
 */
export function initializeTheme(): void {
  if (typeof document === 'undefined') return

  const { themeId, mode } = themeStore.state
  applyTheme(themeId)
  applyColorMode(mode)

  // Listen for system preference changes when in system mode
  if (mode === 'system') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
      if (themeStore.state.mode === 'system') {
        const root = document.documentElement
        root.classList.remove('light', 'dark')
        root.classList.add(e.matches ? 'dark' : 'light')
      }
    })
  }
}

/**
 * Reset theme store to defaults (for testing)
 */
export function resetTheme(): void {
  themeStore.setState(() => DEFAULT_STATE)
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
}

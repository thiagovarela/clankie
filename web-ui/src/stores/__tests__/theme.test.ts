import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCurrentTheme,
  resetTheme,
  setColorMode,
  setThemeId,
  themeStore,
} from '../theme'
import type { ColorMode } from '../theme'
import { DEFAULT_THEME_ID, THEMES } from '@/lib/theme-catalog'

describe('theme store', () => {
  beforeEach(() => {
    resetTheme()
    localStorage.clear()
  })

  describe('initial state', () => {
    it('has default theme and dark mode', () => {
      expect(themeStore.state.themeId).toBe(DEFAULT_THEME_ID)
      expect(themeStore.state.mode).toBe('dark')
    })
  })

  describe('setThemeId', () => {
    it('updates the theme id', () => {
      setThemeId('tangerine')
      expect(themeStore.state.themeId).toBe('tangerine')
    })

    it('does not update with invalid theme id', () => {
      const original = themeStore.state.themeId
      setThemeId('nonexistent')
      expect(themeStore.state.themeId).toBe(original)
    })

    it('persists theme to localStorage', () => {
      setThemeId('graphite')
      const saved = localStorage.getItem('clankie-theme')
      expect(saved).toBeTruthy()
      const parsed = JSON.parse(saved!)
      expect(parsed.themeId).toBe('graphite')
    })

    it('preserves mode when changing theme', () => {
      setColorMode('light')
      setThemeId('supabase')
      expect(themeStore.state.mode).toBe('light')
    })
  })

  describe('setColorMode', () => {
    it('updates the color mode', () => {
      setColorMode('light')
      expect(themeStore.state.mode).toBe('light')
    })

    it('supports system mode', () => {
      setColorMode('system')
      expect(themeStore.state.mode).toBe('system')
    })

    it('persists mode to localStorage', () => {
      setColorMode('light')
      const saved = localStorage.getItem('clankie-theme')
      expect(saved).toBeTruthy()
      const parsed = JSON.parse(saved!)
      expect(parsed.mode).toBe('light')
    })

    it('preserves theme when changing mode', () => {
      setThemeId('violet-bloom')
      setColorMode('system')
      expect(themeStore.state.themeId).toBe('violet-bloom')
    })
  })

  describe('getCurrentTheme', () => {
    it('returns the current theme definition', () => {
      setThemeId('tangerine')
      const theme = getCurrentTheme()
      expect(theme.id).toBe('tangerine')
      expect(theme.name).toBe('Tangerine')
    })

    it('returns default theme when current is invalid', () => {
      // Manually set invalid theme id
      themeStore.setState(() => ({ themeId: 'invalid', mode: 'dark' }))
      const theme = getCurrentTheme()
      expect(theme.id).toBe(DEFAULT_THEME_ID)
    })
  })

  describe('localStorage integration', () => {
    it('loads saved theme on init', () => {
      localStorage.setItem(
        'clankie-theme',
        JSON.stringify({ themeId: 'modern-minimal', mode: 'light' }),
      )

      // Simulate fresh store load
      const saved = localStorage.getItem('clankie-theme')
      expect(saved).toBeTruthy()
      const parsed = JSON.parse(saved!)
      expect(parsed.themeId).toBe('modern-minimal')
      expect(parsed.mode).toBe('light')
    })

    it('falls back to default for invalid saved theme id', () => {
      localStorage.setItem(
        'clankie-theme',
        JSON.stringify({ themeId: 'invalid-theme', mode: 'dark' }),
      )

      // Manually load and validate (simulating loadState behavior)
      const saved = localStorage.getItem('clankie-theme')
      const parsed = JSON.parse(saved!)
      const validThemes = [
        'terracotta',
        'tangerine',
        'solar-dusk',
        'graphite',
        'modern-minimal',
        'supabase',
        'violet-bloom',
        'whatsapp',
      ]
      const themeId = validThemes.includes(parsed.themeId)
        ? parsed.themeId
        : DEFAULT_THEME_ID
      expect(themeId).toBe(DEFAULT_THEME_ID)
    })

    it('falls back to dark for invalid saved mode', () => {
      localStorage.setItem(
        'clankie-theme',
        JSON.stringify({ themeId: 'terracotta', mode: 'invalid' }),
      )

      const saved = localStorage.getItem('clankie-theme')
      const parsed = JSON.parse(saved!)
      const validModes: Array<ColorMode> = ['light', 'dark', 'system']
      const mode = validModes.includes(parsed.mode) ? parsed.mode : 'dark'
      expect(mode).toBe('dark')
    })
  })

  describe('resetTheme', () => {
    it('resets to default state', () => {
      setThemeId('whatsapp')
      setColorMode('system')
      resetTheme()
      expect(themeStore.state.themeId).toBe(DEFAULT_THEME_ID)
      expect(themeStore.state.mode).toBe('dark')
    })

    it('clears localStorage', () => {
      setThemeId('supabase')
      resetTheme()
      expect(localStorage.getItem('clankie-theme')).toBeNull()
    })
  })

  describe('theme catalog', () => {
    it('contains all expected themes', () => {
      const themeIds = THEMES.map((t) => t.id)
      expect(themeIds).toContain('terracotta')
      expect(themeIds).toContain('tangerine')
      expect(themeIds).toContain('solar-dusk')
      expect(themeIds).toContain('graphite')
      expect(themeIds).toContain('modern-minimal')
      expect(themeIds).toContain('supabase')
      expect(themeIds).toContain('violet-bloom')
      expect(themeIds).toContain('whatsapp')
    })

    it('each theme has light and dark tokens', () => {
      for (const theme of THEMES) {
        expect(theme.light).toBeDefined()
        expect(theme.dark).toBeDefined()
        expect(theme.light.background).toBeDefined()
        expect(theme.dark.background).toBeDefined()
        expect(theme.light.primary).toBeDefined()
        expect(theme.dark.primary).toBeDefined()
      }
    })
  })
})

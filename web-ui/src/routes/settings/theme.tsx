import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useState } from 'react'
import type { ThemeDefinition } from '@/lib/theme-catalog'
import type { ColorMode } from '@/stores/theme'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { THEMES } from '@/lib/theme-catalog'
import { setColorMode, setThemeId, themeStore } from '@/stores/theme'

export const Route = createFileRoute('/settings/theme')({
  component: ThemeSettingsPage,
})

const MODE_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const

const MODE_LABELS = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
} as const

function ThemeSettingsPage() {
  const { themeId, mode } = useStore(themeStore, (state) => state)
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('dark')

  const currentTheme = THEMES.find((t) => t.id === themeId) || THEMES[0]

  const handleThemeSelect = (id: string) => {
    setThemeId(id)
  }

  const handleModeChange = (value: string) => {
    if (value) {
      setColorMode(value as ColorMode)
    }
  }

  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-4xl py-8 px-4 space-y-6">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Appearance</h1>
          <p className="text-muted-foreground mt-1">
            Choose your theme and color mode preference
          </p>
        </div>

        {/* Color Mode Section */}
        <Card className="card-depth">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Color Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((m) => {
                const Icon = MODE_ICONS[m]
                return (
                  <Button
                    key={m}
                    variant={mode === m ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleModeChange(m)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {MODE_LABELS[m]}
                  </Button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              System mode automatically matches your device preference
            </p>
          </CardContent>
        </Card>

        {/* Theme Selection */}
        <Card className="card-depth">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Theme
            </CardTitle>
            {/* Preview Mode Toggle (for browsing themes) */}
            <div className="flex gap-1">
              <Button
                variant={previewMode === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('light')}
                className="gap-1.5"
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </Button>
              <Button
                variant={previewMode === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('dark')}
                className="gap-1.5"
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {THEMES.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isActive={theme.id === themeId}
                  previewMode={previewMode}
                  onClick={() => handleThemeSelect(theme.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Current Theme Info */}
        <Card className="card-depth">
          <CardHeader>
            <CardTitle>Active Theme</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ThemePreview
                theme={currentTheme}
                mode={mode === 'system' ? 'auto' : mode}
              />
              <div>
                <p className="font-medium">{currentTheme.name}</p>
                <p className="text-sm text-muted-foreground">
                  {currentTheme.description}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mode: {MODE_LABELS[mode]} • Radius:{' '}
                  {currentTheme.light.radius}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface ThemeCardProps {
  theme: ThemeDefinition
  isActive: boolean
  previewMode: 'light' | 'dark'
  onClick: () => void
}

function ThemeCard({ theme, isActive, previewMode, onClick }: ThemeCardProps) {
  const tokens = previewMode === 'light' ? theme.light : theme.dark

  return (
    <button
      onClick={onClick}
      className={`
        relative rounded-xl border p-4 text-left transition-all
        hover:border-primary/50 hover:bg-muted/50
        ${isActive ? 'border-primary ring-1 ring-primary' : ''}
      `}
      aria-pressed={isActive}
    >
      {isActive && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </div>
      )}

      {/* Mini Preview */}
      <div
        className="mb-3 h-20 rounded-lg border overflow-hidden"
        style={{
          background: tokens.background,
          borderColor: tokens.border,
        }}
      >
        {/* Preview Elements */}
        <div className="p-3 space-y-2">
          {/* Primary color bar */}
          <div
            className="h-3 w-16 rounded"
            style={{ background: tokens.primary }}
          />
          {/* Secondary elements */}
          <div className="flex gap-2">
            <div
              className="h-2 w-8 rounded"
              style={{ background: tokens.secondary }}
            />
            <div
              className="h-2 w-8 rounded"
              style={{ background: tokens.accent }}
            />
          </div>
          {/* Text lines */}
          <div
            className="h-1.5 w-full rounded"
            style={{ background: tokens['muted-foreground'], opacity: 0.5 }}
          />
          <div
            className="h-1.5 w-2/3 rounded"
            style={{ background: tokens['muted-foreground'], opacity: 0.3 }}
          />
        </div>
      </div>

      <p className="font-medium">{theme.name}</p>
      <p className="text-xs text-muted-foreground line-clamp-1">
        {theme.description}
      </p>
    </button>
  )
}

interface ThemePreviewProps {
  theme: ThemeDefinition
  mode: 'light' | 'dark' | 'auto'
}

function ThemePreview({ theme, mode }: ThemePreviewProps) {
  const tokens = mode === 'light' ? theme.light : theme.dark

  return (
    <div
      className="h-16 w-16 rounded-lg border flex flex-col items-center justify-center gap-1.5"
      style={{
        background: tokens.background,
        borderColor: tokens.border,
      }}
    >
      <div className="h-4 w-8 rounded" style={{ background: tokens.primary }} />
      <div className="flex gap-1">
        <div
          className="h-2 w-3 rounded"
          style={{ background: tokens.secondary }}
        />
        <div
          className="h-2 w-3 rounded"
          style={{ background: tokens.accent }}
        />
      </div>
    </div>
  )
}

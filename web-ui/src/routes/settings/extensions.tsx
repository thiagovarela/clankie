import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  Command,
  Flag,
  Folder,
  Keyboard,
  Lightbulb,
  Loader2,
  Package,
  Puzzle,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { ComponentProps } from 'react'
import type { ExtensionCategory } from '@/lib/extension-utils'
import type { ExtensionInfo } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { clientManager } from '@/lib/client-manager'
import {
  deriveExtensionDisplayName,
  getExtensionCategory,
} from '@/lib/extension-utils'
import { JsonRenderRenderer } from '@/lib/tool-renderers/json-render-renderer'
import { connectionStore } from '@/stores/connection'
import {
  extensionsStore,
  resetInstallStatus,
  setExtensions,
  setInstallStatus,
  setLoading,
} from '@/stores/extensions'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/settings/extensions')({
  component: ExtensionsSettingsPage,
})

type ExtensionListItem = {
  ext: ExtensionInfo
  displayName: string
  category: ExtensionCategory
  searchBlob: string
}

const categoryOrder: Array<ExtensionCategory> = ['builtIn', 'packages', 'local']

const categoryMeta = {
  builtIn: {
    label: 'Built-in',
    description: 'Inline and core extensions bundled with clankie',
    icon: Sparkles,
  },
  packages: {
    label: 'Packages',
    description: 'Extensions loaded from packages and extension folders',
    icon: Package,
  },
  local: {
    label: 'Local',
    description: 'Extensions loaded from your workspace files',
    icon: Folder,
  },
} as const

function formatCount(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? '' : 's'}`
}

function ExtensionsSettingsPage() {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { activeSessionId } = useStore(sessionsListStore, (state) => ({
    activeSessionId: state.activeSessionId,
  }))

  const { extensions, extensionErrors, isLoading, installStatus } = useStore(
    extensionsStore,
    (state) => state,
  )

  const [searchValue, setSearchValue] = useState('')
  const [packageSource, setPackageSource] = useState('')
  const [installScope, setInstallScope] = useState<'user' | 'project'>('user')

  const isConnected = status === 'connected'

  const loadExtensions = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId) return

    setLoading(true)
    try {
      await client.reload(activeSessionId)

      const { extensions: extList, errors } =
        await client.getExtensions(activeSessionId)

      setExtensions(extList, errors)
    } catch (err) {
      console.error('Failed to load extensions:', err)
      setLoading(false)
    }
  }, [activeSessionId])

  const installPackage = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId) return

    const source = packageSource.trim()
    if (!source) {
      setInstallStatus({
        isInstalling: false,
        error: 'Package source is required',
      })
      return
    }

    resetInstallStatus()
    setInstallStatus({
      isInstalling: true,
      output: `Installing ${source} (${installScope} scope)...`,
      exitCode: null,
      error: undefined,
    })

    try {
      const result = await client.installPackage(
        activeSessionId,
        source,
        installScope === 'project',
      )

      setInstallStatus({
        isInstalling: false,
        output: result.output,
        exitCode: result.exitCode,
        error: undefined,
      })
      setPackageSource('')
      await loadExtensions()
    } catch (err) {
      setInstallStatus({
        isInstalling: false,
        error:
          err instanceof Error ? err.message : 'Failed to install package',
        exitCode: 1,
      })
    }
  }, [activeSessionId, installScope, loadExtensions, packageSource])

  useEffect(() => {
    if (isConnected && activeSessionId) {
      loadExtensions()
    }
  }, [isConnected, activeSessionId, loadExtensions])

  const extensionItems = useMemo<Array<ExtensionListItem>>(
    () =>
      extensions.map((ext) => {
        const displayName = deriveExtensionDisplayName(
          ext.path,
          ext.resolvedPath,
        )

        return {
          ext,
          displayName,
          category: getExtensionCategory(ext),
          searchBlob: [
            displayName,
            ext.path,
            ext.resolvedPath,
            ext.tools.join(' '),
            ext.commands.join(' '),
            ext.flags.join(' '),
            ext.shortcuts.join(' '),
          ]
            .join(' ')
            .toLowerCase(),
        }
      }),
    [extensions],
  )

  const normalizedSearch = searchValue.trim().toLowerCase()

  const filteredExtensions = useMemo(
    () =>
      normalizedSearch.length === 0
        ? extensionItems
        : extensionItems.filter((item) =>
            item.searchBlob.includes(normalizedSearch),
          ),
    [extensionItems, normalizedSearch],
  )

  const groupedExtensions = useMemo(
    () =>
      filteredExtensions.reduce<
        Record<ExtensionCategory, Array<ExtensionListItem>>
      >(
        (acc, item) => {
          acc[item.category].push(item)
          return acc
        },
        {
          builtIn: [],
          packages: [],
          local: [],
        },
      ),
    [filteredExtensions],
  )

  const summary = useMemo(
    () =>
      filteredExtensions.reduce(
        (acc, item) => ({
          extensions: acc.extensions + 1,
          tools: acc.tools + item.ext.tools.length,
          commands: acc.commands + item.ext.commands.length,
          flags: acc.flags + item.ext.flags.length,
        }),
        {
          extensions: 0,
          tools: 0,
          commands: 0,
          flags: 0,
        },
      ),
    [filteredExtensions],
  )

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center chat-background">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-2">
            <Puzzle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Not Connected</h2>
            <p className="text-muted-foreground">
              Connect to clankie to view loaded extensions
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center chat-background">
        <div className="text-center space-y-3">
          <div className="inline-flex gap-1 mb-2">
            <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
            <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
            <span className="typing-dot inline-block h-3 w-3 rounded-full bg-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading extensions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-5xl py-8 px-4 space-y-6">
        <Card className="card-depth">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Puzzle className="h-5 w-5" />
                Extensions
              </CardTitle>
              <CardDescription>
                Loaded extensions with tools, commands, flags, and optional
                configuration
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadExtensions}>
              <Loader2 className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {extensionErrors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-destructive">
                      Extension Load Errors
                    </p>
                    <div className="mt-2 space-y-2">
                      {extensionErrors.map((err) => (
                        <div key={`${err.path}-${err.error}`} className="text-xs">
                          <p className="font-mono text-muted-foreground">
                            {err.path}
                          </p>
                          <p className="text-destructive">{err.error}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {extensions.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No extensions loaded.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Install packages below or ask the AI to use manage_packages.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Search extensions, tools, or commands"
                      className="pl-9"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4">
                    <SummaryStat
                      label="Extensions"
                      value={summary.extensions}
                    />
                    <SummaryStat label="Tools" value={summary.tools} />
                    <SummaryStat label="Commands" value={summary.commands} />
                    <SummaryStat label="Flags" value={summary.flags} />
                  </div>

                  {normalizedSearch.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Showing {filteredExtensions.length} of {extensions.length}{' '}
                      extensions
                    </p>
                  )}
                </div>

                {filteredExtensions.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <p className="text-sm font-medium">
                      No matching extensions
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Try searching by extension name, path, tool, or command.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {categoryOrder.map((category) => {
                      const items = groupedExtensions[category]
                      if (items.length === 0) {
                        return null
                      }

                      const metadata = categoryMeta[category]
                      const CategoryIcon = metadata.icon

                      return (
                        <section key={category} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <CategoryIcon className="h-4 w-4 text-primary" />
                              <p className="text-sm font-medium">
                                {metadata.label}
                              </p>
                              <Badge variant="outline" className="text-[10px]">
                                {items.length}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground hidden sm:block">
                              {metadata.description}
                            </p>
                          </div>

                          <div className="space-y-2">
                            {items.map((item) => (
                              <ExtensionCard
                                key={`${item.ext.path}-${item.ext.resolvedPath}`}
                                ext={item.ext}
                                displayName={item.displayName}
                                category={item.category}
                                activeSessionId={activeSessionId}
                                onConfigSaved={loadExtensions}
                              />
                            ))}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="card-depth border-primary/20 bg-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-medium mb-1">Install Package</h3>
                  <p className="text-sm text-muted-foreground">
                    Use this controlled installer to ensure packages are installed
                    in clankie paths.
                  </p>
                </div>

                <div className="space-y-2">
                  <Input
                    value={packageSource}
                    onChange={(event) => setPackageSource(event.target.value)}
                    placeholder="npm:@foo/pi-tools or git:github.com/user/repo"
                    disabled={installStatus.isInstalling}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={installScope === 'user' ? 'default' : 'outline'}
                      onClick={() => setInstallScope('user')}
                      disabled={installStatus.isInstalling}
                    >
                      User scope (~/.clankie)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        installScope === 'project' ? 'default' : 'outline'
                      }
                      onClick={() => setInstallScope('project')}
                      disabled={installStatus.isInstalling}
                    >
                      Project scope (.pi)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={installPackage}
                      disabled={installStatus.isInstalling}
                    >
                      {installStatus.isInstalling ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Installing...
                        </>
                      ) : (
                        'Install'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {(installStatus.output || installStatus.error) && (
              <div className="rounded-md border bg-background/70 p-3 space-y-2">
                {installStatus.error && (
                  <p className="text-xs text-destructive">{installStatus.error}</p>
                )}
                {installStatus.output && (
                  <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                    {installStatus.output}
                  </pre>
                )}
                {installStatus.exitCode !== null && (
                  <p className="text-xs text-muted-foreground">
                    Exit code: {installStatus.exitCode}
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={resetInstallStatus}
                  disabled={installStatus.isInstalling}
                >
                  Clear output
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function ExtensionCard({
  ext,
  displayName,
  category,
  activeSessionId,
  onConfigSaved,
}: {
  ext: ExtensionInfo
  displayName: string
  category: ExtensionCategory
  activeSessionId: string | null
  onConfigSaved: () => void
}) {
  const [isOpen, setIsOpen] = useState(Boolean(ext.uiSpec))

  const categoryIconByType: Record<ExtensionCategory, typeof Sparkles> = {
    builtIn: Sparkles,
    packages: Package,
    local: Folder,
  }

  const Icon = categoryIconByType[category]

  const summaryItems = [
    formatCount(ext.tools.length, 'tool'),
    formatCount(ext.commands.length, 'command'),
    formatCount(ext.flags.length, 'flag'),
    formatCount(ext.shortcuts.length, 'shortcut'),
  ]

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-lg border bg-card/40"
    >
      <CollapsibleTrigger className="group w-full rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/20">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md border bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{displayName}</p>
              {ext.uiSpec && (
                <Badge variant="default" className="text-[10px]">
                  Config UI
                </Badge>
              )}
            </div>

            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {ext.path}
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              {summaryItems.join(' · ')}
            </p>
          </div>

          <ChevronDown
            className={`mt-1 h-4 w-4 text-muted-foreground transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t px-4 pb-4 pt-3">
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 text-xs">
            <p className="uppercase tracking-wide text-muted-foreground">
              Path
            </p>
            <p className="mt-1 font-mono break-all">{ext.path}</p>
            {ext.resolvedPath !== ext.path && (
              <>
                <p className="mt-2 uppercase tracking-wide text-muted-foreground">
                  Resolved
                </p>
                <p className="mt-1 font-mono break-all">{ext.resolvedPath}</p>
              </>
            )}
          </div>

          <div className="space-y-3">
            <CapabilityGroup
              icon={Wrench}
              label="Tools"
              values={ext.tools}
              variant="secondary"
            />
            <CapabilityGroup
              icon={Command}
              label="Commands"
              values={ext.commands}
              valuePrefix="/"
              variant="default"
            />
            <CapabilityGroup
              icon={Flag}
              label="Flags"
              values={ext.flags}
              valuePrefix="--"
              variant="outline"
            />
            <CapabilityGroup
              icon={Keyboard}
              label="Shortcuts"
              values={ext.shortcuts}
              variant="outline"
              mono
            />
          </div>

          {ext.uiSpec && activeSessionId && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Extension Configuration
              </p>
              <JsonRenderRenderer
                spec={ext.uiSpec}
                sessionId={activeSessionId}
                extensionPath={ext.path}
                initialState={ext.uiState}
                onConfigSaved={onConfigSaved}
              />
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function CapabilityGroup({
  icon: Icon,
  label,
  values,
  valuePrefix,
  variant,
  mono,
}: {
  icon: typeof Sparkles
  label: string
  values: Array<string>
  valuePrefix?: string
  variant: ComponentProps<typeof Badge>['variant']
  mono?: boolean
}) {
  if (values.length === 0) {
    return null
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium">{label}</span>
        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
          {values.length}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge
            key={value}
            variant={variant}
            className={mono ? 'font-mono text-[11px]' : ''}
          >
            {valuePrefix}
            {value}
          </Badge>
        ))}
      </div>
    </div>
  )
}

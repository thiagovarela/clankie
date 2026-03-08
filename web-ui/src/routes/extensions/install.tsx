import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useCallback, useState } from 'react'
import {
  Check,
  Download,
  ExternalLink,
  Loader2,
  Package,
  Puzzle,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clientManager } from '@/lib/client-manager'
import { connectionStore } from '@/stores/connection'
import { extensionsStore, setExtensions, setLoading } from '@/stores/extensions'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/extensions/install')({
  component: ExtensionsInstallPage,
})

interface CuratedExtension {
  name: string
  packageName: string
  description: string
  author?: string
  category: 'productivity' | 'development' | 'integration' | 'utility'
  tags?: Array<string>
  url?: string
}

const CURATED_EXTENSIONS: Array<CuratedExtension> = [
  {
    name: 'Memory',
    packageName: 'npm:@clankie/memory',
    description: 'Persistent memory with TursoDB native vector search for clankie. Store and retrieve context across sessions.',
    author: 'clankie',
    category: 'productivity',
    tags: ['memory', 'vector-search', 'persistence'],
  },
  {
    name: 'Web Search',
    packageName: 'npm:@clankie/web-search',
    description: 'Headless web search and page extraction using CloakBrowser + Playwright. Search the web and extract content.',
    author: 'clankie',
    category: 'integration',
    tags: ['search', 'web', 'browser'],
  },
  {
    name: 'Sandbox',
    packageName: 'npm:@clankie/sandbox',
    description: 'Gondolin micro-VM sandbox — runs agent tools inside an isolated VM with network policies, secret injection, and filesystem isolation.',
    author: 'clankie',
    category: 'utility',
    tags: ['sandbox', 'security', 'isolation'],
  },
  {
    name: 'JSON UI Render',
    packageName: 'npm:@clankie/json-ui-render',
    description: 'Render structured chat UI via details.renderHint and details.uiSpec. Create rich interactive components.',
    author: 'clankie',
    category: 'development',
    tags: ['ui', 'render', 'components'],
  },
]

const categoryColors: Record<string, string> = {
  productivity: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  development: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  integration: 'bg-green-500/10 text-green-500 border-green-500/20',
  utility: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
}

function ExtensionsInstallPage() {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { activeSessionId } = useStore(sessionsListStore, (state) => ({
    activeSessionId: state.activeSessionId,
  }))

  const { extensions } = useStore(extensionsStore, (state) => ({
    extensions: state.extensions,
  }))

  const [searchValue, setSearchValue] = useState('')
  const [packageSource, setPackageSource] = useState('')
  const [installingPackage, setInstallingPackage] = useState<string | null>(null)
  const [installOutput, setInstallOutput] = useState<{
    output?: string
    error?: string
    exitCode?: number | null
  } | null>(null)

  const isConnected = status === 'connected'

  const isExtensionInstalled = useCallback(
    (packageName: string): boolean => {
      return extensions.some(
        (ext) =>
          ext.path.includes(packageName.replace('npm:', '').replace('@', '').replace('/', '-')) ||
          ext.path === packageName,
      )
    },
    [extensions],
  )

  const loadExtensions = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId) return

    setLoading(true)
    try {
      await client.reload(activeSessionId)
      const { extensions: extList, errors } = await client.getExtensions(activeSessionId)
      setExtensions(extList, errors)
    } catch (err) {
      console.error('Failed to load extensions:', err)
      setLoading(false)
    }
  }, [activeSessionId])

  const installPackage = useCallback(
    async (source: string) => {
      const client = clientManager.getClient()
      if (!client || !activeSessionId) return

      setInstallingPackage(source)
      setInstallOutput({ output: `Installing ${source}...` })

      try {
        const result = await client.installPackage(activeSessionId, source, false)
        setInstallOutput({
          output: result.output,
          exitCode: result.exitCode,
        })
        await loadExtensions()
      } catch (err) {
        setInstallOutput({
          error: err instanceof Error ? err.message : 'Failed to install package',
          exitCode: 1,
        })
      } finally {
        setInstallingPackage(null)
      }
    },
    [activeSessionId, loadExtensions],
  )

  const handleCustomInstall = useCallback(async () => {
    const source = packageSource.trim()
    if (!source) {
      setInstallOutput({ error: 'Package source is required' })
      return
    }
    await installPackage(source)
    setPackageSource('')
  }, [installPackage, packageSource])

  const filteredExtensions = CURATED_EXTENSIONS.filter(
    (ext) =>
      searchValue === '' ||
      ext.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      ext.description.toLowerCase().includes(searchValue.toLowerCase()) ||
      ext.tags?.some((tag) => tag.toLowerCase().includes(searchValue.toLowerCase())),
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
              Connect to clankie to install extensions
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-5xl py-8 px-4 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Install Extensions</h1>
          <p className="text-muted-foreground">
            Discover and install extensions to enhance your clankie experience
          </p>
        </div>

        {/* Custom Install Card */}
        <Card className="card-depth border-primary/20 bg-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-medium mb-1">Install from Package</h3>
                  <p className="text-sm text-muted-foreground">
                    Install any npm package or git repository
                  </p>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={packageSource}
                    onChange={(e) => setPackageSource(e.target.value)}
                    placeholder="npm:@foo/pi-tools or git:github.com/user/repo"
                    disabled={installingPackage !== null}
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomInstall()}
                  />
                  <Button
                    onClick={handleCustomInstall}
                    disabled={installingPackage !== null || !packageSource.trim()}
                  >
                    {installingPackage === packageSource ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Install
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {installOutput && (
              <div className="rounded-md border bg-background/70 p-3 space-y-2">
                {installOutput.error && (
                  <p className="text-xs text-destructive">{installOutput.error}</p>
                )}
                {installOutput.output && (
                  <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                    {installOutput.output}
                  </pre>
                )}
                {installOutput.exitCode !== null && installOutput.exitCode !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Exit code: {installOutput.exitCode}
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setInstallOutput(null)}
                >
                  Clear output
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Curated Extensions */}
        <Card className="card-depth">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="h-5 w-5" />
              Curated Extensions
            </CardTitle>
            <CardDescription>
              Popular and recommended extensions for clankie
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search extensions..."
                className="pl-9"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {filteredExtensions.map((ext) => {
                const installed = isExtensionInstalled(ext.packageName)
                const installing = installingPackage === ext.packageName

                return (
                  <div
                    key={ext.packageName}
                    className="rounded-lg border bg-card/40 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{ext.name}</h3>
                          <Badge
                            variant="outline"
                            className={categoryColors[ext.category]}
                          >
                            {ext.category}
                          </Badge>
                        </div>
                        {ext.author && (
                          <p className="text-xs text-muted-foreground">
                            by {ext.author}
                          </p>
                        )}
                      </div>
                      {installed ? (
                        <Badge variant="default" className="shrink-0">
                          <Check className="h-3 w-3 mr-1" />
                          Installed
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => installPackage(ext.packageName)}
                          disabled={installing}
                          className="shrink-0"
                        >
                          {installing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              Install
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {ext.description}
                    </p>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {ext.tags?.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      {ext.url && (
                        <a
                          href={ext.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {filteredExtensions.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  No extensions match your search.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

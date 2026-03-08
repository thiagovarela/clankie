import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Code2,
  Command,
  Flag,
  Keyboard,
  Loader2,
  Package,
  Puzzle,
  Settings,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react'
import type { ExtensionDetails } from '@/lib/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { clientManager } from '@/lib/client-manager'
import { deriveExtensionDisplayName, getExtensionCategory } from '@/lib/extension-utils'
import { JsonRenderRenderer } from '@/lib/tool-renderers/json-render-renderer'
import { connectionStore } from '@/stores/connection'
import { extensionsStore, setExtensions, setLoading } from '@/stores/extensions'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/extensions/$extensionId')({
  component: ExtensionDetailPage,
})

function ExtensionDetailPage() {
  const { extensionId } = Route.useParams()
  const navigate = useNavigate()

  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { activeSessionId } = useStore(sessionsListStore, (state) => ({
    activeSessionId: state.activeSessionId,
  }))

  const { extensions } = useStore(extensionsStore, (state) => ({
    extensions: state.extensions,
  }))

  const [details, setDetails] = useState<ExtensionDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUninstalling, setIsUninstalling] = useState(false)

  const isConnected = status === 'connected'

  // Find the extension from the list by matching the ID (URL-encoded path)
  const extension = useMemo(() => {
    const decodedId = decodeURIComponent(extensionId)
    return extensions.find(
      (ext) =>
        ext.path === decodedId ||
        ext.resolvedPath === decodedId ||
        encodeURIComponent(ext.path) === extensionId,
    )
  }, [extensions, extensionId])

  const displayName = useMemo(() => {
    if (!extension) return 'Extension'
    return deriveExtensionDisplayName(extension.path, extension.resolvedPath)
  }, [extension])

  const category = useMemo(() => {
    if (!extension) return 'packages'
    return getExtensionCategory(extension)
  }, [extension])

  const loadDetails = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId || !extension) return

    setIsLoading(true)
    setError(null)

    try {
      const detailsData = await client.getExtensionDetails(
        activeSessionId,
        extension.path,
      )
      setDetails(detailsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load extension details')
    } finally {
      setIsLoading(false)
    }
  }, [activeSessionId, extension])

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

  const handleUninstall = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId || !extension) return

    setIsUninstalling(true)
    try {
      await client.uninstallExtension(activeSessionId, extension.path)
      await loadExtensions()
      navigate({ to: '/extensions/install' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall extension')
    } finally {
      setIsUninstalling(false)
    }
  }, [activeSessionId, extension, loadExtensions, navigate])

  useEffect(() => {
    if (isConnected && activeSessionId && extension) {
      loadDetails()
    }
  }, [isConnected, activeSessionId, extension, loadDetails])

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
              Connect to clankie to view extension details
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!extension) {
    return (
      <div className="h-full flex items-center justify-center chat-background">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted border mb-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Extension Not Found</h2>
            <p className="text-muted-foreground">
              The extension you're looking for doesn't exist or isn't installed.
            </p>
            <Button variant="outline" onClick={() => navigate({ to: '/extensions/install' })}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Extensions
            </Button>
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
          <p className="text-sm text-muted-foreground">Loading extension details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-5xl py-8 px-4 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate({ to: '/extensions/install' })}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
              <Badge variant="outline" className="capitalize">
                {category}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono truncate max-w-xl">
              {extension.path}
            </p>
          </div>

          {category === 'packages' && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm" disabled={isUninstalling}>
                    {isUninstalling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Uninstall
                      </>
                    )}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Uninstall Extension</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to uninstall "{displayName}"? This will remove
                    it from your clankie configuration.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleUninstall}>
                    Uninstall
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue={details?.readme ? 'readme' : 'overview'} className="space-y-4">
          <TabsList>
            {details?.readme && (
              <TabsTrigger value="readme" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                README
              </TabsTrigger>
            )}
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Overview
            </TabsTrigger>
            {details?.tools && details.tools.length > 0 && (
              <TabsTrigger value="tools" className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Tools ({details.tools.length})
              </TabsTrigger>
            )}
            {details?.uiSpec && (
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configuration
              </TabsTrigger>
            )}
          </TabsList>

          {/* README Tab */}
          {details?.readme && (
            <TabsContent value="readme">
              <Card className="card-depth">
                <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{details.readme}</ReactMarkdown>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Path Info */}
            <Card className="card-depth">
              <CardHeader>
                <CardTitle className="text-base">Path Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md bg-muted/20 p-3 text-xs">
                  <p className="uppercase tracking-wide text-muted-foreground">
                    Path
                  </p>
                  <p className="mt-1 font-mono break-all">{extension.path}</p>
                  {extension.resolvedPath !== extension.path && (
                    <>
                      <p className="mt-2 uppercase tracking-wide text-muted-foreground">
                        Resolved
                      </p>
                      <p className="mt-1 font-mono break-all">{extension.resolvedPath}</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            {details?.skills && details.skills.length > 0 && (
              <Card className="card-depth">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Skills
                    <Badge variant="outline" className="ml-auto">
                      {details.skills.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {details.skills.map((skill) => (
                    <div
                      key={skill.name}
                      className="rounded-md border bg-muted/20 p-3"
                    >
                      <p className="font-medium text-sm">{skill.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {skill.description}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mt-2 truncate">
                        {skill.filePath}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Commands */}
            {details?.commands && details.commands.length > 0 && (
              <Card className="card-depth">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Command className="h-4 w-4" />
                    Commands
                    <Badge variant="outline" className="ml-auto">
                      {details.commands.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {details.commands.map((cmd) => (
                      <div key={cmd.name} className="group relative">
                        <Badge variant="default">/{cmd.name}</Badge>
                        {cmd.description && (
                          <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-10 w-48 p-2 text-xs bg-popover border rounded-md shadow-md">
                            {cmd.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Flags & Shortcuts */}
            {((details?.flags && details.flags.length > 0) ||
              (details?.shortcuts && details.shortcuts.length > 0)) && (
              <Card className="card-depth">
                <CardContent className="pt-6 space-y-4">
                  {details?.flags && details.flags.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Flag className="h-4 w-4" />
                        Flags
                        <Badge variant="outline" className="text-[10px]">
                          {details.flags.length}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {details.flags.map((flag) => (
                          <Badge key={flag} variant="outline">
                            --{flag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {details?.shortcuts && details.shortcuts.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Keyboard className="h-4 w-4" />
                        Shortcuts
                        <Badge variant="outline" className="text-[10px]">
                          {details.shortcuts.length}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {details.shortcuts.map((shortcut) => (
                          <Badge key={shortcut} variant="outline" className="font-mono">
                            {shortcut}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tools Tab */}
          {details?.tools && details.tools.length > 0 && (
            <TabsContent value="tools" className="space-y-4">
              {details.tools.map((tool) => (
                <Collapsible key={tool.name}>
                  <Card className="card-depth">
                    <CollapsibleTrigger className="w-full text-left">
                      <CardHeader className="py-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Wrench className="h-4 w-4" />
                            {tool.name}
                          </CardTitle>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                        </div>
                        {tool.description && (
                          <CardDescription className="text-left">
                            {tool.description}
                          </CardDescription>
                        )}
                      </CardHeader>
                    </CollapsibleTrigger>
                    {tool.inputSchema && (
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="rounded-md bg-muted/20 p-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                              <Code2 className="h-3 w-3" />
                              Input Schema
                            </div>
                            <pre className="text-xs overflow-auto">
                              {JSON.stringify(tool.inputSchema, null, 2)}
                            </pre>
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    )}
                  </Card>
                </Collapsible>
              ))}
            </TabsContent>
          )}

          {/* Configuration Tab */}
          {details?.uiSpec && activeSessionId && (
            <TabsContent value="config">
              <Card className="card-depth">
                <CardHeader>
                  <CardTitle className="text-base">Extension Configuration</CardTitle>
                  <CardDescription>
                    Configure this extension's settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <JsonRenderRenderer
                    spec={details.uiSpec}
                    sessionId={activeSessionId}
                    extensionPath={extension.path}
                    initialState={details.uiState}
                    onConfigSaved={loadDetails}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}

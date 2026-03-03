import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertCircle, Lightbulb, Loader2, Package, Puzzle } from 'lucide-react'
import { useCallback, useEffect } from 'react'
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
import { clientManager } from '@/lib/client-manager'
import { JsonRenderRenderer } from '@/lib/tool-renderers/json-render-renderer'
import { connectionStore } from '@/stores/connection'
import { extensionsStore, setExtensions, setLoading } from '@/stores/extensions'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/settings/extensions')({
  component: ExtensionsSettingsPage,
})

function ExtensionsSettingsPage() {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { activeSessionId } = useStore(sessionsListStore, (state) => ({
    activeSessionId: state.activeSessionId,
  }))

  const { extensions, extensionErrors, isLoading } = useStore(
    extensionsStore,
    (state) => state,
  )

  const isConnected = status === 'connected'

  const loadExtensions = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId) return

    setLoading(true)
    try {
      // Reload session resources first to pick up extensions installed via chat
      await client.reload(activeSessionId)

      const { extensions: extList, errors } =
        await client.getExtensions(activeSessionId)

      setExtensions(extList, errors)
    } catch (err) {
      console.error('Failed to load extensions:', err)
      setLoading(false)
    }
  }, [activeSessionId])

  useEffect(() => {
    if (isConnected && activeSessionId) {
      loadExtensions()
    }
  }, [isConnected, activeSessionId, loadExtensions])

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
      <div className="container max-w-4xl py-8 px-4 space-y-6">
        {/* Install Package Hint */}
        <Card className="card-depth border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-1">Installing Packages</h3>
                <p className="text-sm text-muted-foreground">
                  To install extensions and packages, simply ask the AI in chat.
                  For example:
                </p>
                <code className="block mt-2 rounded bg-muted/50 p-2 text-xs font-mono">
                  install @pi/heartbeat
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  The AI will handle the installation process for you.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Extensions Section */}
        <Card className="card-depth">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Puzzle className="h-5 w-5" />
                Extensions
              </CardTitle>
              <CardDescription>
                Loaded extensions with their registered tools and commands
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadExtensions}>
              <Loader2
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : 'hidden'}`}
              />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {extensionErrors.length > 0 && (
              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-destructive">
                      Extension Load Errors
                    </p>
                    <div className="mt-2 space-y-2">
                      {extensionErrors.map((err, idx) => (
                        <div key={idx} className="text-xs">
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
                  Ask the AI to install extensions for you.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {extensions.map((ext, idx) => (
                  <ExtensionCard
                    key={idx}
                    ext={ext}
                    activeSessionId={activeSessionId}
                    onConfigSaved={loadExtensions}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ExtensionCard({
  ext,
  activeSessionId,
  onConfigSaved,
}: {
  ext: ExtensionInfo
  activeSessionId: string | null
  onConfigSaved: () => void
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium font-mono break-all">{ext.path}</p>
          {ext.resolvedPath !== ext.path && (
            <p className="text-xs text-muted-foreground font-mono mt-1 break-all">
              → {ext.resolvedPath}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {ext.tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Tools:</span>
              {ext.tools.map((tool) => (
                <Badge key={tool} variant="secondary" className="text-xs">
                  {tool}
                </Badge>
              ))}
            </div>
          )}

          {ext.commands.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">
                Commands:
              </span>
              {ext.commands.map((cmd) => (
                <Badge key={cmd} variant="default" className="text-xs">
                  /{cmd}
                </Badge>
              ))}
            </div>
          )}

          {ext.flags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">Flags:</span>
              {ext.flags.map((flag) => (
                <Badge key={flag} variant="outline" className="text-xs">
                  --{flag}
                </Badge>
              ))}
            </div>
          )}

          {ext.shortcuts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">
                Shortcuts:
              </span>
              {ext.shortcuts.map((shortcut) => (
                <Badge
                  key={shortcut}
                  variant="outline"
                  className="text-xs font-mono"
                >
                  {shortcut}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {ext.uiSpec && activeSessionId && (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Extension UI
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
    </div>
  )
}

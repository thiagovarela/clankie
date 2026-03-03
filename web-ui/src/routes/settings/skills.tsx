import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  AlertCircle,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect } from 'react'
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
import { connectionStore } from '@/stores/connection'
import { extensionsStore, setLoading, setSkills } from '@/stores/extensions'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/settings/skills')({
  component: SkillsSettingsPage,
})

function SkillsSettingsPage() {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const { activeSessionId } = useStore(sessionsListStore, (state) => ({
    activeSessionId: state.activeSessionId,
  }))

  const { skills, skillDiagnostics, isLoading } = useStore(
    extensionsStore,
    (state) => state,
  )

  const isConnected = status === 'connected'

  const loadSkills = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client || !activeSessionId) return

    setLoading(true)
    try {
      const { skills: skillsList, diagnostics } =
        await client.getSkills(activeSessionId)

      setSkills(skillsList, diagnostics)
    } catch (err) {
      console.error('Failed to load skills:', err)
      setLoading(false)
    }
  }, [activeSessionId])

  useEffect(() => {
    if (isConnected && activeSessionId) {
      loadSkills()
    }
  }, [isConnected, activeSessionId, loadSkills])

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center chat-background">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-2">
            <Sparkles className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Not Connected</h2>
            <p className="text-muted-foreground">
              Connect to clankie to view loaded skills
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
          <p className="text-sm text-muted-foreground">Loading skills...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-4xl py-8 px-4 space-y-6">
        {/* About Skills */}
        <Card className="card-depth border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-1">What are Skills?</h3>
                <p className="text-sm text-muted-foreground">
                  Skills are specialized capabilities that extend the AI's
                  abilities. They can be installed as packages or defined in
                  your project.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  To add skills, ask the AI: "install skill-name" or create a
                  SKILL.md file in your project.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills Section */}
        <Card className="card-depth">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Skills
              </CardTitle>
              <CardDescription>
                Available skills for the agent in the current session
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadSkills}>
              <Loader2
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : 'hidden'}`}
              />
              <RefreshCw
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                className={`h-4 w-4 mr-2 ${isLoading ? 'hidden' : ''}`}
              />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {skillDiagnostics.length > 0 && (
              <div className="mb-4 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-600">
                      Skill Diagnostics
                    </p>
                    <div className="mt-2 space-y-1">
                      {skillDiagnostics.map((diag, idx) => (
                        <p key={idx} className="text-xs text-yellow-700">
                          {diag.path && (
                            <span className="font-mono">{diag.path}: </span>
                          )}
                          {diag.message}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {skills.length === 0 ? (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No skills loaded.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Skills can be added by installing packages or creating
                  SKILL.md files.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {skills.map((skill, idx) => (
                  <div key={idx} className="rounded-lg border p-3">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{skill.name}</p>
                            {skill.disableModelInvocation && (
                              <Badge variant="outline" className="text-xs">
                                Manual only
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {skill.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium">Source:</span>{' '}
                          {skill.source}
                        </span>
                        <span>•</span>
                        <span className="font-mono break-all">
                          {skill.filePath}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Skill Sources Info */}
        <Card className="card-depth">
          <CardHeader>
            <CardTitle>Skill Sources</CardTitle>
            <CardDescription>
              Skills can be loaded from different sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <h4 className="font-medium mb-1">Project Skills</h4>
                <p className="text-xs text-muted-foreground">
                  SKILL.md files in your project directory
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <h4 className="font-medium mb-1">Package Skills</h4>
                <p className="text-xs text-muted-foreground">
                  Skills bundled with installed Pi packages
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <h4 className="font-medium mb-1">Global Skills</h4>
                <p className="text-xs text-muted-foreground">
                  System-wide skills available to all projects
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <h4 className="font-medium mb-1">Built-in Skills</h4>
                <p className="text-xs text-muted-foreground">
                  Core skills that come with clankie
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Filter, Loader2, Sparkles, XCircle } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { clientManager } from '@/lib/client-manager'
import { connectionStore } from '@/stores/connection'
import { sessionStore } from '@/stores/session'
import {
  scopedModelsStore,
  setScopedEnabledModels,
} from '@/stores/scoped-models'

export const Route = createFileRoute('/settings/scoped-models')({
  component: ScopedModelsSettingsPage,
})

function formatProviderName(provider: string): string {
  const nameMap: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    'amazon-bedrock': 'Amazon Bedrock',
    openrouter: 'OpenRouter',
    'vercel-ai-gateway': 'Vercel AI Gateway',
    xai: 'xAI',
    mistral: 'Mistral',
    groq: 'Groq',
    huggingface: 'Hugging Face',
    'google-vertex': 'Google Vertex AI',
    'google-antigravity': 'Google Antigravity',
    'google-gemini-cli': 'Google Gemini CLI',
    'azure-openai-responses': 'Azure OpenAI',
    'github-copilot': 'GitHub Copilot',
    cerebras: 'Cerebras',
    opencode: 'OpenCode',
    zai: 'Z.ai',
    minimax: 'MiniMax',
    'minimax-cn': 'MiniMax (CN)',
    'kimi-coding': 'Kimi',
  }

  return (
    nameMap[provider] ||
    provider
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}

function ScopedModelsSettingsPage() {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const isConnected = status === 'connected'

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center chat-background">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-2">
            <Filter className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Not Connected</h2>
            <p className="text-muted-foreground">
              Connect to clankie to configure scoped models
            </p>
          </div>
        </div>
      </div>
    )
  }

  return <ScopedModelsSection />
}

function ScopedModelsSection() {
  const { enabledModels, isLoading } = useStore(scopedModelsStore, (state) => ({
    enabledModels: state.enabledModels,
    isLoading: state.isLoading,
  }))

  const { availableModels, sessionId } = useStore(sessionStore, (state) => ({
    availableModels: state.availableModels,
    sessionId: state.sessionId,
  }))

  const [pendingSave, setPendingSave] = useState(false)

  // Use store value directly as source of truth
  const selectedModels = enabledModels ?? []

  // Build options from available models
  const options = useMemo(() => {
    return availableModels.map((model) => ({
      value: `${model.provider}/${model.id}`,
      label: `${formatProviderName(model.provider)} / ${model.name}`,
      model,
    }))
  }, [availableModels])

  const handleToggleModel = useCallback(
    async (modelValue: string) => {
      if (!sessionId || pendingSave) return

      const client = clientManager.getClient()
      if (!client) return

      const isSelected = selectedModels.includes(modelValue)
      const newSelection = isSelected
        ? selectedModels.filter((m) => m !== modelValue)
        : [...selectedModels, modelValue]

      setPendingSave(true)
      try {
        const result = await client.setScopedModels(sessionId, newSelection)
        setScopedEnabledModels(result.enabledModels ?? [])
      } catch (err) {
        console.error(
          '[ScopedModelsSection] Failed to save scoped models:',
          err,
        )
        // Keep current selection on error (server is source of truth)
      } finally {
        setPendingSave(false)
      }
    },
    [sessionId, selectedModels, pendingSave],
  )

  // Get selected model info for display
  const selectedModelInfo = useMemo(() => {
    return selectedModels
      .map((value) => {
        const option = options.find((o) => o.value === value)
        return option || { value, label: value }
      })
      .filter(Boolean)
  }, [selectedModels, options])

  const hasSelection = selectedModels.length > 0
  const isProcessing = pendingSave || isLoading

  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-2xl py-8 px-4">
        <Card className="card-depth">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Scoped Models
            </CardTitle>
            <CardDescription>
              Choose which models are available in the model selector. Leave
              empty to show all available models.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sessionId ? (
              <p className="text-sm text-muted-foreground">
                Connect to a session to configure scoped models.
              </p>
            ) : options.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading available models...
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selected models chips */}
                {hasSelection && (
                  <div className="flex flex-wrap gap-2">
                    {selectedModelInfo.map((info) => (
                      <button
                        key={info.value}
                        onClick={() => handleToggleModel(info.value)}
                        disabled={isProcessing}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        type="button"
                      >
                        {info.label}
                        <XCircle className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Available models dropdown */}
                <div className="relative">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleToggleModel(e.target.value)
                        e.target.value = ''
                      }
                    }}
                    disabled={isProcessing || isLoading}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">
                      {hasSelection
                        ? 'Add another model...'
                        : 'Select models...'}
                    </option>
                    {options
                      .filter((opt) => !selectedModels.includes(opt.value))
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {hasSelection
                      ? `${selectedModels.length} model${selectedModels.length === 1 ? '' : 's'} selected`
                      : 'All models available (no restrictions)'}
                  </span>
                  {(isLoading || isProcessing) && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {isProcessing ? 'Saving...' : 'Loading...'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4 card-depth">
          <CardHeader>
            <CardTitle>About Scoped Models</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Scoped models allow you to filter the model selector to only show
              specific models you want to use.
            </p>
            <p>
              This is useful when you have many models available but only want
              to see a curated subset in the dropdown.
            </p>
            <p className="text-xs">
              Changes are saved per session and take effect immediately in the
              model selector.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

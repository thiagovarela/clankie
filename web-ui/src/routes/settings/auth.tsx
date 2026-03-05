import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Shield,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthProvider } from '@/lib/types'
import { AuthLoginDialog } from '@/components/auth-login-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { clientManager } from '@/lib/client-manager'
import {
  authStore,
  setLoadingProviders,
  setProviders,
  startLoginFlow,
} from '@/stores/auth'
import { connectionStore } from '@/stores/connection'
import { sessionStore, setAvailableModels } from '@/stores/session'
import { sessionsListStore } from '@/stores/sessions-list'
import {
  scopedModelsStore,
  setScopedEnabledModels,
} from '@/stores/scoped-models'

export const Route = createFileRoute('/settings/auth')({
  component: AuthSettingsPage,
})

function AuthSettingsPage() {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }))

  const isConnected = status === 'connected'

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center chat-background">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-2">
            <Shield className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Not Connected</h2>
            <p className="text-muted-foreground">
              Connect to clankie to manage AI provider authentication
            </p>
          </div>
        </div>
      </div>
    )
  }

  return <ProviderAuthSection />
}

function ProviderAuthSection() {
  const { providers, isLoadingProviders, loginFlow } = useStore(
    authStore,
    (state) => ({
      providers: state.providers,
      isLoadingProviders: state.isLoadingProviders,
      loginFlow: state.loginFlow,
    }),
  )

  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [apiKeyProviderId, setApiKeyProviderId] = useState<string | null>(null)
  const [apiKeyValue, setApiKeyValue] = useState('')

  const loadProviders = useCallback(async () => {
    const client = clientManager.getClient()
    if (!client) return

    setLoadingProviders(true)
    try {
      const { providers: providerList } = await client.getAuthProviders()
      setProviders(providerList)
    } catch (err) {
      console.error('Failed to load auth providers:', err)
      setProviders([])
    }
  }, [])

  // Load providers when component mounts
  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  // Refresh provider list and available models after successful OAuth login
  useEffect(() => {
    if (loginFlow?.status === 'complete' && loginFlow.success === true) {
      loadProviders()

      // Also refresh available models for the active session
      const { activeSessionId } = sessionsListStore.state
      if (activeSessionId) {
        const client = clientManager.getClient()
        if (client) {
          client
            .getAvailableModels(activeSessionId)
            .then(({ models }) => {
              setAvailableModels(models)
              console.log(
                '[settings/auth] Refreshed available models after OAuth login',
              )
            })
            .catch((err) => {
              console.error(
                '[settings/auth] Failed to refresh available models:',
                err,
              )
            })
        }
      }
    }
  }, [loginFlow?.status, loginFlow?.success, loadProviders])

  const handleOAuthLogin = async (providerId: string) => {
    const client = clientManager.getClient()
    if (!client) return

    try {
      const { loginFlowId } = await client.authLogin(providerId)
      startLoginFlow(loginFlowId, providerId)
      setLoginDialogOpen(true)
    } catch (err) {
      console.error('Failed to start login:', err)
    }
  }

  const handleApiKeyLogin = (providerId: string) => {
    setApiKeyProviderId(providerId)
    setApiKeyValue('')
  }

  const handleApiKeySave = async (providerId: string) => {
    const client = clientManager.getClient()
    if (!client || !apiKeyValue.trim()) return

    try {
      await client.authSetApiKey(providerId, apiKeyValue.trim())
      setApiKeyProviderId(null)
      setApiKeyValue('')
      await loadProviders() // Refresh the list
    } catch (err) {
      console.error('Failed to save API key:', err)
    }
  }

  const handleLogout = async (providerId: string) => {
    const client = clientManager.getClient()
    if (!client) return

    try {
      await client.authLogout(providerId)
      await loadProviders() // Refresh the list
    } catch (err) {
      console.error('Failed to logout:', err)
    }
  }

  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-2xl py-8 px-4">
        <Card className="card-depth">
          <CardHeader>
            <CardTitle>AI Provider Authentication</CardTitle>
            <CardDescription>
              Configure authentication for AI providers (OpenAI, Anthropic,
              etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingProviders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : providers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No providers available. Make sure clankie is configured with at
                least one AI provider.
              </p>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    isEditing={apiKeyProviderId === provider.id}
                    apiKeyValue={apiKeyValue}
                    onApiKeyChange={setApiKeyValue}
                    onLogin={() =>
                      provider.type === 'oauth'
                        ? handleOAuthLogin(provider.id)
                        : handleApiKeyLogin(provider.id)
                    }
                    onSaveApiKey={() => handleApiKeySave(provider.id)}
                    onCancelApiKey={() => setApiKeyProviderId(null)}
                    onLogout={() => handleLogout(provider.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <ScopedModelsSection />

        <Card className="mt-4 card-depth">
          <CardHeader>
            <CardTitle>About Provider Authentication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              AI providers require authentication to access their APIs. You can
              authenticate using:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>OAuth</strong> - Browser-based authentication flow for
                supported providers
              </li>
              <li>
                <strong>API Key</strong> - Direct API key entry for providers
                that support it
              </li>
            </ul>
            <p className="text-xs">
              Your credentials are stored securely by clankie and are never
              shared with the web UI.
            </p>
          </CardContent>
        </Card>
      </div>

      <AuthLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
      />
    </div>
  )
}

function ProviderCard({
  provider,
  isEditing,
  apiKeyValue,
  onApiKeyChange,
  onLogin,
  onSaveApiKey,
  onCancelApiKey,
  onLogout,
}: {
  provider: AuthProvider
  isEditing: boolean
  apiKeyValue: string
  onApiKeyChange: (value: string) => void
  onLogin: () => void
  onSaveApiKey: () => void
  onCancelApiKey: () => void
  onLogout: () => void
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium">{provider.name}</h4>
            <Badge
              variant={provider.type === 'oauth' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {provider.type === 'oauth' ? (
                <>
                  <Shield className="h-3 w-3 mr-1" />
                  OAuth
                </>
              ) : (
                <>
                  <KeyRound className="h-3 w-3 mr-1" />
                  API Key
                </>
              )}
            </Badge>
            {provider.hasAuth ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {provider.hasAuth ? 'Authenticated' : 'Not configured'}
          </p>

          {isEditing && provider.type === 'apikey' && (
            <div className="mt-3 space-y-2">
              <Field>
                <FieldLabel htmlFor={`api-key-${provider.id}`}>
                  API Key
                </FieldLabel>
                <Input
                  id={`api-key-${provider.id}`}
                  type="password"
                  placeholder="Enter API key"
                  value={apiKeyValue}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  autoFocus
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={onSaveApiKey}
                  disabled={!apiKeyValue.trim()}
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={onCancelApiKey}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex gap-2">
            {provider.hasAuth ? (
              <Button size="sm" variant="outline" onClick={onLogout}>
                Logout
              </Button>
            ) : (
              <Button size="sm" onClick={onLogin}>
                Login
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Scoped Models Section ────────────────────────────────────────────────────

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
    <Card className="mt-4 card-depth">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Scoped Models
        </CardTitle>
        <CardDescription>
          Choose which models are available in the model selector. Leave empty
          to show all available models.
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
                  {hasSelection ? 'Add another model...' : 'Select models...'}
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
  )
}

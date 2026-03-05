import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Shield,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
import { setAvailableModels } from '@/stores/session'
import { sessionsListStore } from '@/stores/sessions-list'

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


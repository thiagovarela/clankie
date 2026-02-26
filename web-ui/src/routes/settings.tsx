import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { CheckCircle2, KeyRound, Loader2, Shield, XCircle } from 'lucide-react'
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
import { connectionStore, updateConnectionSettings } from '@/stores/connection'
import { setAvailableModels } from '@/stores/session'
import { sessionsListStore } from '@/stores/sessions-list'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { settings, status } = useStore(connectionStore, (state) => ({
    settings: state.settings,
    status: state.status,
  }))

  const [url, setUrl] = useState(settings.url)
  const [authToken, setAuthToken] = useState(settings.authToken)

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  const handleSave = () => {
    updateConnectionSettings({ url, authToken })
  }

  const handleConnect = () => {
    updateConnectionSettings({ url, authToken })
    clientManager.connect()
  }

  const handleDisconnect = () => {
    clientManager.disconnect()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-2xl py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Connection Settings</CardTitle>
            <CardDescription>
              Configure the WebSocket connection to your clankie instance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor="ws-url">WebSocket URL</FieldLabel>
              <Input
                id="ws-url"
                type="text"
                placeholder="ws://localhost:3100"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isConnected}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="auth-token">Auth Token</FieldLabel>
              <Input
                id="auth-token"
                type="password"
                placeholder="Enter your authentication token"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                disabled={isConnected}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set with:{' '}
                <code className="rounded bg-muted px-1 py-0.5">
                  clankie config set channels.web.authToken "your-token"
                </code>
              </p>
            </Field>

            <div className="flex gap-2 pt-2">
              {!isConnected ? (
                <>
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting || !authToken}
                  >
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSave}
                    disabled={isConnecting}
                  >
                    Save
                  </Button>
                </>
              ) : (
                <Button variant="destructive" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              )}
            </div>

            {!authToken && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-medium">Auth token required</p>
                <p className="text-xs mt-1">
                  Configure the token in clankie and enter it above to connect.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">
                1. Enable the web channel in clankie
              </p>
              <code className="block mt-1 rounded bg-muted p-2 text-xs">
                clankie config set channels.web.authToken "your-secret-token"
                <br />
                clankie config set channels.web.port 3100
              </code>
            </div>

            <div>
              <p className="font-medium">2. Start the clankie daemon</p>
              <code className="block mt-1 rounded bg-muted p-2 text-xs">
                clankie start
              </code>
            </div>

            <div>
              <p className="font-medium">
                3. Enter the token above and connect
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The web-ui will connect to ws://localhost:3100 by default
              </p>
            </div>
          </CardContent>
        </Card>

        {isConnected && <ProviderAuthSection />}
      </div>
    </div>
  )
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
                '[settings] Refreshed available models after OAuth login',
              )
            })
            .catch((err) => {
              console.error(
                '[settings] Failed to refresh available models:',
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
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>AI Provider Authentication</CardTitle>
          <CardDescription>
            Configure authentication for AI providers (OpenAI, Anthropic, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingProviders ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No providers available.
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

      <AuthLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
      />
    </>
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

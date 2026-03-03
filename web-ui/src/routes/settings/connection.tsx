import { Link, createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Settings } from 'lucide-react'
import { useState } from 'react'
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
import { connectionStore, updateConnectionSettings } from '@/stores/connection'

export const Route = createFileRoute('/settings/connection')({
  component: ConnectionSettingsPage,
})

function ConnectionSettingsPage() {
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
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-2xl py-8 px-4">
        <Card className="card-depth">
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

        <Card className="mt-4 card-depth">
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

        {!isConnected && (
          <div className="mt-4 text-center">
            <Link to="/settings">
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Back to Settings
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

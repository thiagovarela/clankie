import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { connectionStore, updateConnectionSettings } from "@/stores/connection";
import { clientManager } from "@/lib/client-manager";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, status } = useStore(connectionStore, (state) => ({
    settings: state.settings,
    status: state.status,
  }));

  const [url, setUrl] = useState(settings.url);
  const [authToken, setAuthToken] = useState(settings.authToken);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  const handleSave = () => {
    updateConnectionSettings({ url, authToken });
  };

  const handleConnect = () => {
    updateConnectionSettings({ url, authToken });
    clientManager.connect();
  };

  const handleDisconnect = () => {
    clientManager.disconnect();
  };

  return (
    <div className="container max-w-2xl py-8">
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
              Set with: <code className="rounded bg-muted px-1 py-0.5">clankie config set channels.web.authToken "your-token"</code>
            </p>
          </Field>

          <div className="flex gap-2 pt-2">
            {!isConnected ? (
              <>
                <Button onClick={handleConnect} disabled={isConnecting || !authToken}>
                  {isConnecting ? "Connecting..." : "Connect"}
                </Button>
                <Button variant="outline" onClick={handleSave} disabled={isConnecting}>
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
            <p className="font-medium">1. Enable the web channel in clankie</p>
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
            <p className="font-medium">3. Enter the token above and connect</p>
            <p className="text-xs text-muted-foreground mt-1">
              The web-ui will connect to ws://localhost:3100 by default
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

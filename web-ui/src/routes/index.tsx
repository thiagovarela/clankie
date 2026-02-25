import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessages } from "@/components/chat-messages";
import { ChatInput } from "@/components/chat-input";
import { connectionStore } from "@/stores/connection";
import { sessionStore } from "@/stores/session";
import { clientManager } from "@/lib/client-manager";

export const Route = createFileRoute("/")({
  component: ChatPage,
});

function ChatPage() {
  const { status } = useStore(connectionStore, (state) => ({
    status: state.status,
  }));

  const { sessionId } = useStore(sessionStore, (state) => ({
    sessionId: state.sessionId,
  }));

  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const isConnected = status === "connected";

  // Auto-create session when connected
  useEffect(() => {
    if (isConnected && !sessionId && !isCreatingSession) {
      setIsCreatingSession(true);
      const client = clientManager.getClient();
      if (client) {
        client
          .newSession()
          .then(() => {
            setIsCreatingSession(false);
          })
          .catch((err) => {
            console.error("Failed to create session:", err);
            setIsCreatingSession(false);
          });
      }
    }
  }, [isConnected, sessionId, isCreatingSession]);

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Not Connected</h2>
            <p className="text-muted-foreground">
              Configure your connection to get started
            </p>
          </div>
          <Link to="/settings">
            <Button>
              <Settings className="mr-2 h-4 w-4" />
              Go to Settings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isCreatingSession) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
          <p className="text-sm text-muted-foreground">Creating session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatMessages />
      <ChatInput />
    </div>
  );
}

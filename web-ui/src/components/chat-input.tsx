import { useStore } from "@tanstack/react-store";
import { useState, useRef, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sessionStore } from "@/stores/session";
import { addUserMessage } from "@/stores/messages";
import { clientManager } from "@/lib/client-manager";

export function ChatInput() {
  const { sessionId, isStreaming } = useStore(sessionStore, (state) => ({
    sessionId: state.sessionId,
    isStreaming: state.isStreaming,
  }));

  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!message.trim() || !sessionId || isStreaming) return;

    const content = message.trim();
    setMessage("");

    // Add user message to UI immediately
    addUserMessage(content);

    // Send to agent
    const client = clientManager.getClient();
    if (client) {
      try {
        await client.prompt(sessionId, content);
      } catch (err) {
        console.error("Failed to send message:", err);
        // Could show error toast here
      }
    }

    // Focus back on textarea
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message... (Ctrl+Enter to send)"
          className="min-h-[80px] resize-none"
          disabled={!sessionId || isStreaming}
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || !sessionId || isStreaming}
          className="self-end"
          size="icon"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Press <kbd className="rounded bg-muted px-1.5 py-0.5">Ctrl+Enter</kbd> to send
      </p>
    </div>
  );
}

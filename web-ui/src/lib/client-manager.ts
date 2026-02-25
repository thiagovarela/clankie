/**
 * Client manager — singleton that manages the clankie client and updates stores.
 */

import { ClankieClient } from "./clankie-client";
import type { AgentSessionEvent, RpcResponse } from "./types";
import { updateConnectionStatus, connectionStore } from "@/stores/connection";
import {
  setSessionId,
  updateSessionState,
  setModel,
  setThinkingLevel,
  setSessionName,
  setStreaming,
  setCompacting,
} from "@/stores/session";
import {
  addUserMessage,
  startAssistantMessage,
  appendStreamToken,
  endAssistantMessage,
  startThinking,
  appendThinkingToken,
  endThinking,
  setMessages,
} from "@/stores/messages";

class ClientManager {
  private client: ClankieClient | null = null;

  connect(): void {
    if (this.client) {
      console.warn("Client already connected");
      return;
    }

    const { settings } = connectionStore.state;
    
    if (!settings.authToken) {
      updateConnectionStatus("error", "Auth token is required");
      return;
    }

    this.client = new ClankieClient({
      url: settings.url,
      authToken: settings.authToken,
      onEvent: (sessionId, event) => this.handleEvent(sessionId, event),
      onStateChange: (state, error) => updateConnectionStatus(state, error),
    });

    this.client.connect();
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  getClient(): ClankieClient | null {
    return this.client;
  }

  isConnected(): boolean {
    return this.client?.getConnectionState() === "connected";
  }

  private handleEvent(sessionId: string, event: AgentSessionEvent | RpcResponse): void {
    // Handle RPC responses (shouldn't normally reach here as they're handled by promises)
    if (event.type === "response") {
      console.log("[client-manager] RPC response:", event);
      return;
    }

    // Handle agent session events
    switch (event.type) {
      case "session_start":
        setSessionId(event.sessionId);
        break;

      case "stream_start":
        startAssistantMessage();
        setStreaming(true);
        break;

      case "stream_token":
        appendStreamToken(event.accumulated);
        break;

      case "stream_end":
        endAssistantMessage();
        setStreaming(false);
        break;

      case "thinking_start":
        startThinking();
        break;

      case "thinking_token":
        appendThinkingToken(event.accumulated);
        break;

      case "thinking_end":
        endThinking();
        break;

      case "model_changed":
        setModel(event.model);
        break;

      case "thinking_level_changed":
        setThinkingLevel(event.level);
        break;

      case "session_name_changed":
        setSessionName(event.name);
        break;

      case "compact_start":
        setCompacting(true);
        break;

      case "compact_end":
        setCompacting(false);
        break;

      case "state_update":
        updateSessionState(event.state);
        break;

      case "error":
        console.error("[client-manager] Agent error:", event.error);
        // Could show a toast notification here
        break;

      case "tool_use_start":
        console.log("[client-manager] Tool use:", event.toolName);
        break;

      case "tool_result":
        console.log("[client-manager] Tool result:", event.result.slice(0, 100));
        break;

      default:
        console.log("[client-manager] Unhandled event:", event);
    }
  }
}

export const clientManager = new ClientManager();

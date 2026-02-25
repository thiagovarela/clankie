/**
 * Client manager — singleton that manages the clankie client and updates stores.
 */

import { updateLoginFlow } from "@/stores/auth";
import { connectionStore, updateConnectionStatus } from "@/stores/connection";
import {
	appendStreamToken,
	appendThinkingToken,
	clearMessages,
	endAssistantMessage,
	endThinking,
	setMessages,
	startAssistantMessage,
	startThinking,
} from "@/stores/messages";
import {
	resetSession,
	setCompacting,
	setModel,
	setSessionId,
	setSessionName,
	setStreaming,
	setThinkingLevel,
	updateSessionState,
} from "@/stores/session";
import {
	addSession,
	clearSessions,
	sessionsListStore,
	setActiveSession,
	updateSessionMeta,
} from "@/stores/sessions-list";
import { ClankieClient } from "./clankie-client";
import type { AgentSessionEvent, AuthEvent, RpcResponse } from "./types";

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
			onAuthEvent: (event) => this.handleAuthEvent(event),
			onStateChange: (state, error) => updateConnectionStatus(state, error),
		});

		this.client.connect();
	}

	disconnect(): void {
		if (this.client) {
			this.client.disconnect();
			this.client = null;
		}
		// Clear sessions list on disconnect
		clearSessions();
		resetSession();
		clearMessages();
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

		const { activeSessionId } = sessionsListStore.state;
		const isActiveSession = sessionId === activeSessionId;

		// Handle agent session events (pi-agent-core event protocol)
		switch (event.type) {
			// ─── Session events ────────────────────────────────────────────────
			case "session_start":
				// Add new session to the list
				addSession({
					sessionId,
					name: undefined,
					model: undefined,
					messageCount: 0,
					createdAt: Date.now(),
				});

				// Set as active and update single-session store only if it's the active one
				if (isActiveSession) {
					setSessionId(sessionId);
				}
				break;

			case "session_name_changed":
				// Update session list metadata for any session
				updateSessionMeta(sessionId, { name: event.name });

				// Update single-session store only if active
				if (isActiveSession) {
					setSessionName(event.name);
				}
				break;

			case "model_changed":
				// Update session list metadata for any session
				updateSessionMeta(sessionId, { model: event.model });

				// Update single-session store only if active
				if (isActiveSession) {
					setModel(event.model);
				}
				break;

			case "thinking_level_changed":
				if (isActiveSession) {
					setThinkingLevel(event.level);
				}
				break;

			case "state_update":
				// Update message count in session list
				updateSessionMeta(sessionId, {
					messageCount: event.state.messageCount,
				});

				if (isActiveSession) {
					updateSessionState(event.state);
				}
				break;

			// ─── Agent lifecycle ───────────────────────────────────────────────
			case "agent_start":
				if (isActiveSession) {
					setStreaming(true);
				}
				break;

			case "agent_end":
				if (isActiveSession) {
					setStreaming(false);
				}
				break;

			// ─── Message streaming ─────────────────────────────────────────────
			case "message_start":
				if (isActiveSession && event.message?.role === "assistant") {
					startAssistantMessage();
				}
				break;

			case "message_update": {
				if (!isActiveSession) break;

				const ame = event.assistantMessageEvent;

				switch (ame.type) {
					case "text_delta":
						// Use the accumulated text from the partial assistant message
						appendStreamToken(
							ame.partial?.content
								?.filter((c: any) => c.type === "text")
								.map((c: any) => c.text)
								.join("") ?? "",
						);
						break;

					case "thinking_start":
						startThinking();
						break;

					case "thinking_delta":
						appendThinkingToken(
							ame.partial?.content
								?.filter((c: any) => c.type === "thinking")
								.map((c: any) => c.thinking)
								.join("") ?? "",
						);
						break;

					case "thinking_end":
						endThinking();
						break;
				}
				break;
			}

			case "message_end":
				if (isActiveSession && event.message?.role === "assistant") {
					endAssistantMessage();
				}
				break;

			// ─── Turn lifecycle ────────────────────────────────────────────────
			case "turn_start":
			case "turn_end":
				break;

			// ─── Tool execution ────────────────────────────────────────────────
			case "tool_execution_start":
				if (isActiveSession) {
					console.log("[client-manager] Tool execution:", event.toolName);
				}
				break;

			case "tool_execution_update":
				break;

			case "tool_execution_end":
				break;

			// ─── Compaction ────────────────────────────────────────────────────
			case "compact_start":
			case "auto_compaction_start":
				if (isActiveSession) {
					setCompacting(true);
				}
				break;

			case "compact_end":
			case "auto_compaction_end":
				if (isActiveSession) {
					setCompacting(false);
				}
				break;

			// ─── Errors ────────────────────────────────────────────────────────
			case "error":
				console.error("[client-manager] Agent error:", event.error);
				break;

			default:
				console.log("[client-manager] Unhandled event:", event);
		}
	}

	private handleAuthEvent(event: AuthEvent): void {
		console.log("[client-manager] Auth event:", event);
		updateLoginFlow(event);
	}

	// ─── Session management ────────────────────────────────────────────────────

	async createNewSession(): Promise<string | null> {
		if (!this.client) {
			console.error("[client-manager] Cannot create session: not connected");
			return null;
		}

		try {
			const result = await this.client.newSession();
			if (result.cancelled) {
				console.log("[client-manager] Session creation cancelled");
				return null;
			}

			// Session will be added to the list via session_start event
			// Set it as active
			setActiveSession(result.sessionId);

			// Clear messages for the new session
			clearMessages();

			return result.sessionId;
		} catch (err) {
			console.error("[client-manager] Failed to create session:", err);
			return null;
		}
	}

	async switchSession(sessionId: string): Promise<void> {
		if (!this.client) {
			console.error("[client-manager] Cannot switch session: not connected");
			return;
		}

		try {
			// Set as active session
			setActiveSession(sessionId);

			// Clear current messages
			clearMessages();

			// Fetch messages for the new session
			const { messages } = await this.client.getMessages(sessionId);
			setMessages(messages);

			// Fetch and update session state
			const state = await this.client.getState(sessionId);
			setSessionId(sessionId);
			setModel(state.model);
			setThinkingLevel(state.thinkingLevel);
			if (state.sessionName) {
				setSessionName(state.sessionName);
			}
			updateSessionState(state);

			console.log(`[client-manager] Switched to session ${sessionId}`);
		} catch (err) {
			console.error("[client-manager] Failed to switch session:", err);
		}
	}
}

export const clientManager = new ClientManager();

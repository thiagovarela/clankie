/**
 * WebSocket channel — bridges pi's RPC protocol over WebSocket.
 *
 * Protocol:
 * - Client → Server: { sessionId?: string, command: RpcCommand }
 * - Server → Client: { sessionId: string, event: AgentEvent | RpcResponse | RpcExtensionUIRequest }
 *
 * One WebSocket connection can handle multiple sessions.
 * Sessions are identified by unique sessionId from pi's AgentSession.
 */

import * as crypto from "node:crypto";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
import { type AgentSession, type AgentSessionEvent, AuthStorage } from "@mariozechner/pi-coding-agent";
import type { ServerWebSocket } from "bun";
import { getAuthPath, loadConfig } from "../config.ts";
import { getOrCreateSession } from "../sessions.ts";
import type { Channel, MessageHandler } from "./channel.ts";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WebChannelOptions {
	/** Port to listen on (default: 3100) */
	port: number;
	/** Required shared secret for authentication */
	authToken: string;
	/** Allowed origins for CORS-like validation (empty = allow all) */
	allowedOrigins?: string[];
}

/** Inbound message from client */
interface InboundWebMessage {
	sessionId?: string;
	command: RpcCommand;
}

/** Outbound message to client */
interface OutboundWebMessage {
	sessionId: string; // "_auth" for auth events
	event: AgentSessionEvent | RpcResponse | RpcExtensionUIRequest | AuthEvent;
}

/** RPC command types from pi */
type RpcCommand =
	| { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
	| { id?: string; type: "steer"; message: string; images?: ImageContent[] }
	| { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
	| { id?: string; type: "abort" }
	| { id?: string; type: "new_session"; parentSession?: string }
	| { id?: string; type: "list_sessions" }
	| { id?: string; type: "get_state" }
	| { id?: string; type: "set_model"; provider: string; modelId: string }
	| { id?: string; type: "cycle_model" }
	| { id?: string; type: "get_available_models" }
	| { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
	| { id?: string; type: "cycle_thinking_level" }
	| { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
	| { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
	| { id?: string; type: "compact"; customInstructions?: string }
	| { id?: string; type: "set_auto_compaction"; enabled: boolean }
	| { id?: string; type: "set_auto_retry"; enabled: boolean }
	| { id?: string; type: "abort_retry" }
	| { id?: string; type: "bash"; command: string }
	| { id?: string; type: "abort_bash" }
	| { id?: string; type: "get_session_stats" }
	| { id?: string; type: "export_html"; outputPath?: string }
	| { id?: string; type: "switch_session"; sessionPath: string }
	| { id?: string; type: "fork"; entryId: string }
	| { id?: string; type: "get_fork_messages" }
	| { id?: string; type: "get_last_assistant_text" }
	| { id?: string; type: "set_session_name"; name: string }
	| { id?: string; type: "get_messages" }
	| { id?: string; type: "get_commands" }
	| { id?: string; type: "get_auth_providers" }
	| { id?: string; type: "auth_login"; providerId: string }
	| { id?: string; type: "auth_set_api_key"; providerId: string; apiKey: string }
	| { id?: string; type: "auth_login_input"; loginFlowId: string; value: string }
	| { id?: string; type: "auth_login_cancel"; loginFlowId: string }
	| { id?: string; type: "auth_logout"; providerId: string };

/** RPC response types from pi */
type RpcResponse =
	| { id?: string; type: "response"; command: string; success: true; data?: unknown }
	| { id?: string; type: "response"; command: string; success: false; error: string };

/** Auth event types (sent during login flows) */
type AuthEvent =
	| { type: "auth_event"; loginFlowId: string; event: "url"; url: string; instructions?: string }
	| { type: "auth_event"; loginFlowId: string; event: "prompt"; message: string; placeholder?: string }
	| { type: "auth_event"; loginFlowId: string; event: "manual_input" }
	| { type: "auth_event"; loginFlowId: string; event: "progress"; message: string }
	| { type: "auth_event"; loginFlowId: string; event: "complete"; success: boolean; error?: string };

/** Extension UI request types from pi */
type RpcExtensionUIRequest =
	| { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string }
	| {
			type: "extension_ui_request";
			id: string;
			method: "notify";
			message: string;
			notifyType?: "info" | "warning" | "error";
	  }
	| { type: "extension_ui_request"; id: string; method: "setStatus"; statusKey: string; statusText: string | undefined }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines: string[] | undefined;
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
	| { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string };

/** Extension UI response from client */
type RpcExtensionUIResponse =
	| { type: "extension_ui_response"; id: string; value: string }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; cancelled: true };

interface ConnectionData {
	authenticated: boolean;
}

// ─── WebChannel ────────────────────────────────────────────────────────────────

export class WebChannel implements Channel {
	readonly name = "web";
	private options: WebChannelOptions;
	private server: ReturnType<typeof Bun.serve> | null = null;

	/** Map of sessionId → Set of WebSocket connections subscribed to that session */
	private sessionSubscriptions = new Map<string, Set<ServerWebSocket<ConnectionData>>>();

	/** Map of sessionId → AgentSession */
	private sessions = new Map<string, AgentSession>();

	/** Map of sessionId → unsubscribe function for session event listener */
	private sessionUnsubscribers = new Map<string, () => void>();

	/** Pending extension UI requests: Map<requestId, { sessionId, ws }> */
	private pendingExtensionRequests = new Map<string, { sessionId: string; ws: ServerWebSocket<ConnectionData> }>();

	/** Pending auth login flows: Map<loginFlowId, { ws, inputResolver, abortController }> */
	private pendingLoginFlows = new Map<
		string,
		{
			ws: ServerWebSocket<ConnectionData>;
			inputResolver: ((value: string) => void) | null;
			abortController: AbortController;
		}
	>();

	constructor(options: WebChannelOptions) {
		this.options = options;
	}

	async start(handler: MessageHandler): Promise<void> {
		this.handler = handler;

		this.server = Bun.serve({
			port: this.options.port,
			websocket: {
				open: (ws) => this.handleOpen(ws),
				message: (ws, message) => this.handleMessage(ws, message),
				close: (ws) => this.handleClose(ws),
			},
			fetch: (req, server) => {
				// Validate auth token from Authorization header or URL query param
				const authHeader = req.headers.get("Authorization");
				const headerToken = authHeader?.replace(/^Bearer\s+/i, "");

				// Also check URL query param (for browser WebSocket clients that can't send headers)
				const url = new URL(req.url, `http://${req.headers.get("host")}`);
				const queryToken = url.searchParams.get("token");

				const token = headerToken || queryToken;

				if (token !== this.options.authToken) {
					return new Response("Unauthorized", { status: 401 });
				}

				// Validate origin if configured
				if (this.options.allowedOrigins && this.options.allowedOrigins.length > 0) {
					const origin = req.headers.get("Origin");
					if (!origin || !this.options.allowedOrigins.includes(origin)) {
						return new Response("Forbidden", { status: 403 });
					}
				}

				// Upgrade to WebSocket
				const upgraded = server.upgrade(req, {
					data: { authenticated: true } as ConnectionData,
				});

				if (!upgraded) {
					return new Response("WebSocket upgrade failed", { status: 400 });
				}

				// biome-ignore lint/suspicious/noExplicitAny: Bun requires undefined return after upgrade
				return undefined as any; // upgrade successful
			},
		});

		console.log(`[web] WebSocket server listening on port ${this.options.port}`);
	}

	async send(_chatId: string, _text: string, _options?: { threadId?: string }): Promise<void> {
		// No-op — WebChannel uses direct session streaming, not channel.send()
	}

	async stop(): Promise<void> {
		if (this.server) {
			this.server.stop();
			this.server = null;
		}

		// Unsubscribe from all sessions
		for (const unsubscribe of this.sessionUnsubscribers.values()) {
			unsubscribe();
		}
		this.sessionUnsubscribers.clear();
		this.sessionSubscriptions.clear();

		console.log("[web] WebSocket server stopped");
	}

	// ─── WebSocket handlers ────────────────────────────────────────────────────

	private handleOpen(_ws: ServerWebSocket<ConnectionData>): void {
		console.log("[web] Client connected");
	}

	private async handleMessage(ws: ServerWebSocket<ConnectionData>, message: string | Buffer): Promise<void> {
		try {
			const text = typeof message === "string" ? message : message.toString("utf-8");
			const parsed = JSON.parse(text);

			// Handle extension UI responses
			if (parsed.type === "extension_ui_response") {
				this.handleExtensionUIResponse(parsed as RpcExtensionUIResponse);
				return;
			}

			// Handle RPC commands
			const inbound = parsed as InboundWebMessage;
			await this.handleCommand(ws, inbound);
		} catch (err) {
			console.error("[web] Error handling message:", err);
			this.sendError(
				ws,
				undefined,
				"parse",
				`Failed to parse message: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	private handleClose(ws: ServerWebSocket<ConnectionData>): void {
		console.log("[web] Client disconnected");

		// Remove this connection from all session subscriptions
		for (const [sessionId, subscribers] of this.sessionSubscriptions.entries()) {
			subscribers.delete(ws);
			if (subscribers.size === 0) {
				this.sessionSubscriptions.delete(sessionId);
				// Optionally unsubscribe from session events if no one is listening
				// But keep the session alive for reconnection
			}
		}
	}

	// ─── Command handling ──────────────────────────────────────────────────────

	private async handleCommand(ws: ServerWebSocket<ConnectionData>, inbound: InboundWebMessage): Promise<void> {
		const command = inbound.command;
		const commandId = command.id;

		try {
			// Special case: new_session doesn't need a sessionId
			if (command.type === "new_session") {
				const config = loadConfig();
				const chatKey = `web_${crypto.randomUUID()}`;
				const session = await getOrCreateSession(chatKey, config);

				const options = command.parentSession ? { parentSession: command.parentSession } : undefined;
				const cancelled = !(await session.newSession(options));

				// Subscribe AFTER newSession() — sessionId changes during newSession(),
				// so we must use the final ID for tracking in this.sessions
				this.subscribeToSession(session, ws);

				this.sendResponse(ws, session.sessionId, {
					id: commandId,
					type: "response",
					command: "new_session",
					success: true,
					data: { sessionId: session.sessionId, cancelled },
				});
				return;
			}

			// Auth commands don't need a sessionId
			if (
				command.type === "get_auth_providers" ||
				command.type === "auth_login" ||
				command.type === "auth_set_api_key" ||
				command.type === "auth_login_input" ||
				command.type === "auth_login_cancel" ||
				command.type === "auth_logout"
			) {
				await this.handleAuthCommand(ws, command, commandId);
				return;
			}

			// Special case: list_sessions doesn't need a sessionId
			if (command.type === "list_sessions") {
				const sessions = Array.from(this.sessions.entries()).map(([sessionId, session]) => ({
					sessionId,
					name: session.sessionName,
					model: session.model,
					messageCount: session.messages.length,
				}));

				this.sendResponse(ws, undefined, {
					id: commandId,
					type: "response",
					command: "list_sessions",
					success: true,
					data: { sessions },
				});
				return;
			}

			// All other commands require sessionId
			if (!inbound.sessionId) {
				this.sendError(ws, undefined, command.type, "sessionId is required", commandId);
				return;
			}

			const sessionId = inbound.sessionId;

			// Get or create session
			const session = this.sessions.get(sessionId);
			if (!session) {
				// Try to restore session from disk
				// For now, return error - client should use new_session first
				this.sendError(ws, sessionId, command.type, `Session not found: ${sessionId}`, commandId);
				return;
			}

			// Execute command (mirrors rpc-mode.ts logic)
			const response = await this.executeCommand(session, command);
			this.sendResponse(ws, sessionId, response);
		} catch (err) {
			console.error("[web] Command error:", err);
			this.sendError(ws, inbound.sessionId, command.type, err instanceof Error ? err.message : String(err), commandId);
		}
	}

	private async executeCommand(session: AgentSession, command: RpcCommand): Promise<RpcResponse> {
		const id = command.id;

		switch (command.type) {
			case "prompt": {
				// Don't await - events will stream
				session
					.prompt(command.message, {
						images: command.images,
						streamingBehavior: command.streamingBehavior,
						source: "rpc",
					})
					.catch((e) => {
						console.error("[web] Prompt error:", e);
					});
				return { id, type: "response", command: "prompt", success: true };
			}

			case "steer": {
				await session.steer(command.message, command.images);
				return { id, type: "response", command: "steer", success: true };
			}

			case "follow_up": {
				await session.followUp(command.message, command.images);
				return { id, type: "response", command: "follow_up", success: true };
			}

			case "abort": {
				await session.abort();
				return { id, type: "response", command: "abort", success: true };
			}

			case "get_state": {
				const state = {
					model: session.model,
					thinkingLevel: session.thinkingLevel,
					isStreaming: session.isStreaming,
					isCompacting: session.isCompacting,
					steeringMode: session.steeringMode,
					followUpMode: session.followUpMode,
					sessionFile: session.sessionFile,
					sessionId: session.sessionId,
					sessionName: session.sessionName,
					autoCompactionEnabled: session.autoCompactionEnabled,
					messageCount: session.messages.length,
					pendingMessageCount: session.pendingMessageCount,
				};
				return { id, type: "response", command: "get_state", success: true, data: state };
			}

			case "set_model": {
				const models = await session.modelRegistry.getAvailable();
				const model = models.find((m) => m.provider === command.provider && m.id === command.modelId);
				if (!model) {
					return {
						id,
						type: "response",
						command: "set_model",
						success: false,
						error: `Model not found: ${command.provider}/${command.modelId}`,
					};
				}
				await session.setModel(model);
				return { id, type: "response", command: "set_model", success: true, data: model };
			}

			case "cycle_model": {
				const result = await session.cycleModel();
				return { id, type: "response", command: "cycle_model", success: true, data: result ?? null };
			}

			case "get_available_models": {
				const models = await session.modelRegistry.getAvailable();
				return { id, type: "response", command: "get_available_models", success: true, data: { models } };
			}

			case "set_thinking_level": {
				session.setThinkingLevel(command.level);
				return { id, type: "response", command: "set_thinking_level", success: true };
			}

			case "cycle_thinking_level": {
				const level = session.cycleThinkingLevel();
				return { id, type: "response", command: "cycle_thinking_level", success: true, data: level ? { level } : null };
			}

			case "set_steering_mode": {
				session.setSteeringMode(command.mode);
				return { id, type: "response", command: "set_steering_mode", success: true };
			}

			case "set_follow_up_mode": {
				session.setFollowUpMode(command.mode);
				return { id, type: "response", command: "set_follow_up_mode", success: true };
			}

			case "compact": {
				const result = await session.compact(command.customInstructions);
				return { id, type: "response", command: "compact", success: true, data: result };
			}

			case "set_auto_compaction": {
				session.setAutoCompactionEnabled(command.enabled);
				return { id, type: "response", command: "set_auto_compaction", success: true };
			}

			case "set_auto_retry": {
				session.setAutoRetryEnabled(command.enabled);
				return { id, type: "response", command: "set_auto_retry", success: true };
			}

			case "abort_retry": {
				session.abortRetry();
				return { id, type: "response", command: "abort_retry", success: true };
			}

			case "bash": {
				const result = await session.executeBash(command.command);
				return { id, type: "response", command: "bash", success: true, data: result };
			}

			case "abort_bash": {
				session.abortBash();
				return { id, type: "response", command: "abort_bash", success: true };
			}

			case "get_session_stats": {
				const stats = session.getSessionStats();
				return { id, type: "response", command: "get_session_stats", success: true, data: stats };
			}

			case "export_html": {
				const path = await session.exportToHtml(command.outputPath);
				return { id, type: "response", command: "export_html", success: true, data: { path } };
			}

			case "switch_session": {
				const cancelled = !(await session.switchSession(command.sessionPath));
				return { id, type: "response", command: "switch_session", success: true, data: { cancelled } };
			}

			case "fork": {
				const result = await session.fork(command.entryId);
				return {
					id,
					type: "response",
					command: "fork",
					success: true,
					data: { text: result.selectedText, cancelled: result.cancelled },
				};
			}

			case "get_fork_messages": {
				const messages = session.getUserMessagesForForking();
				return { id, type: "response", command: "get_fork_messages", success: true, data: { messages } };
			}

			case "get_last_assistant_text": {
				const text = session.getLastAssistantText();
				return { id, type: "response", command: "get_last_assistant_text", success: true, data: { text } };
			}

			case "set_session_name": {
				const name = command.name.trim();
				if (!name) {
					return {
						id,
						type: "response",
						command: "set_session_name",
						success: false,
						error: "Session name cannot be empty",
					};
				}
				session.setSessionName(name);
				return { id, type: "response", command: "set_session_name", success: true };
			}

			case "get_messages": {
				return { id, type: "response", command: "get_messages", success: true, data: { messages: session.messages } };
			}

			case "get_commands": {
				const commands: Array<{
					name: string;
					description?: string;
					source: string;
					location?: string;
					path?: string;
				}> = [];

				// Extension commands
				for (const { command: cmd, extensionPath } of session.extensionRunner?.getRegisteredCommandsWithPaths() ?? []) {
					commands.push({
						name: cmd.name,
						description: cmd.description,
						source: "extension",
						path: extensionPath,
					});
				}

				// Prompt templates
				for (const template of session.promptTemplates) {
					commands.push({
						name: template.name,
						description: template.description,
						source: "prompt",
						location: template.source,
						path: template.filePath,
					});
				}

				// Skills
				for (const skill of session.resourceLoader.getSkills().skills) {
					commands.push({
						name: `skill:${skill.name}`,
						description: skill.description,
						source: "skill",
						location: skill.source,
						path: skill.filePath,
					});
				}

				return { id, type: "response", command: "get_commands", success: true, data: { commands } };
			}

			default: {
				// biome-ignore lint/suspicious/noExplicitAny: Need to access .type property on unknown command
				const unknownCommand = command as any;
				return {
					id,
					type: "response",
					command: unknownCommand.type,
					success: false,
					error: `Unknown command: ${unknownCommand.type}`,
				};
			}
		}
	}

	// ─── Auth command handling ─────────────────────────────────────────────────

	private async handleAuthCommand(
		ws: ServerWebSocket<ConnectionData>,
		command: RpcCommand,
		commandId?: string,
	): Promise<void> {
		const authStorage = AuthStorage.create(getAuthPath());

		try {
			switch (command.type) {
				case "get_auth_providers": {
					// Get OAuth providers from pi SDK
					const oauthProviders = authStorage.getOAuthProviders();
					const oauthIds = new Set(oauthProviders.map((p) => p.id));

					// List of API key providers (filter out those that have OAuth)
					const apiKeyProviders = [
						{ id: "anthropic", name: "Anthropic" },
						{ id: "openai", name: "OpenAI" },
						{ id: "google", name: "Google (Gemini)" },
						{ id: "xai", name: "xAI (Grok)" },
						{ id: "groq", name: "Groq" },
						{ id: "openrouter", name: "OpenRouter" },
						{ id: "mistral", name: "Mistral" },
					].filter((p) => !oauthIds.has(p.id));

					// Combine both lists
					const providers = [
						...oauthProviders.map((p) => ({
							id: p.id,
							name: p.name,
							type: "oauth" as const,
							hasAuth: authStorage.hasAuth(p.id),
							usesCallbackServer: p.usesCallbackServer ?? false,
						})),
						...apiKeyProviders.map((p) => ({
							id: p.id,
							name: p.name,
							type: "apikey" as const,
							hasAuth: authStorage.hasAuth(p.id),
							usesCallbackServer: false,
						})),
					];

					this.sendAuthResponse(ws, {
						id: commandId,
						type: "response",
						command: "get_auth_providers",
						success: true,
						data: { providers },
					});
					break;
				}

				case "auth_login": {
					const { providerId } = command;

					// Check if there's already an active login flow for this connection
					for (const [_flowId, flow] of this.pendingLoginFlows.entries()) {
						if (flow.ws === ws) {
							this.sendAuthResponse(ws, {
								id: commandId,
								type: "response",
								command: "auth_login",
								success: false,
								error: "Another login flow is already in progress",
							});
							return;
						}
					}

					const loginFlowId = crypto.randomUUID();
					const abortController = new AbortController();

					// Store the flow
					this.pendingLoginFlows.set(loginFlowId, {
						ws,
						inputResolver: null,
						abortController,
					});

					// Send initial response with flow ID
					this.sendAuthResponse(ws, {
						id: commandId,
						type: "response",
						command: "auth_login",
						success: true,
						data: { loginFlowId },
					});

					// Start the OAuth/login flow
					try {
						const callbacks: OAuthLoginCallbacks = {
							onAuth: (info) => {
								this.sendAuthEvent(ws, loginFlowId, {
									type: "auth_event",
									loginFlowId,
									event: "url",
									url: info.url,
									instructions: info.instructions,
								});
							},
							onPrompt: async (prompt) => {
								// Send prompt event and wait for client response
								return new Promise<string>((resolve) => {
									const flow = this.pendingLoginFlows.get(loginFlowId);
									if (flow) {
										flow.inputResolver = resolve;
										this.sendAuthEvent(ws, loginFlowId, {
											type: "auth_event",
											loginFlowId,
											event: "prompt",
											message: prompt.message,
											placeholder: prompt.placeholder,
										});
									} else {
										resolve(""); // Flow was cancelled
									}
								});
							},
							onProgress: (message) => {
								this.sendAuthEvent(ws, loginFlowId, {
									type: "auth_event",
									loginFlowId,
									event: "progress",
									message,
								});
							},
							onManualCodeInput: async () => {
								// Show manual input UI and wait for client response
								this.sendAuthEvent(ws, loginFlowId, {
									type: "auth_event",
									loginFlowId,
									event: "manual_input",
								});

								return new Promise<string>((resolve) => {
									const flow = this.pendingLoginFlows.get(loginFlowId);
									if (flow) {
										flow.inputResolver = resolve;
									} else {
										resolve(""); // Flow was cancelled
									}
								});
							},
							signal: abortController.signal,
						};

						await authStorage.login(providerId, callbacks);

						// Success
						this.sendAuthEvent(ws, loginFlowId, {
							type: "auth_event",
							loginFlowId,
							event: "complete",
							success: true,
						});
					} catch (err) {
						// Error or cancelled
						const isAborted = err instanceof Error && err.name === "AbortError";
						this.sendAuthEvent(ws, loginFlowId, {
							type: "auth_event",
							loginFlowId,
							event: "complete",
							success: false,
							error: isAborted ? "Login cancelled" : err instanceof Error ? err.message : String(err),
						});
					} finally {
						// Clean up
						this.pendingLoginFlows.delete(loginFlowId);
					}
					break;
				}

				case "auth_set_api_key": {
					const { providerId, apiKey } = command;
					authStorage.set(providerId, { type: "api_key", key: apiKey });

					this.sendAuthResponse(ws, {
						id: commandId,
						type: "response",
						command: "auth_set_api_key",
						success: true,
					});
					break;
				}

				case "auth_login_input": {
					const { loginFlowId, value } = command;
					const flow = this.pendingLoginFlows.get(loginFlowId);

					if (flow?.inputResolver) {
						flow.inputResolver(value);
						flow.inputResolver = null;
					}
					// No response needed — this is fire-and-forget
					break;
				}

				case "auth_login_cancel": {
					const { loginFlowId } = command;
					const flow = this.pendingLoginFlows.get(loginFlowId);

					if (flow) {
						flow.abortController.abort();
						this.pendingLoginFlows.delete(loginFlowId);
					}
					// No response needed
					break;
				}

				case "auth_logout": {
					const { providerId } = command;
					authStorage.logout(providerId);

					this.sendAuthResponse(ws, {
						id: commandId,
						type: "response",
						command: "auth_logout",
						success: true,
					});
					break;
				}
			}
		} catch (err) {
			this.sendAuthResponse(ws, {
				id: commandId,
				type: "response",
				command: command.type,
				success: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	private sendAuthEvent(ws: ServerWebSocket<ConnectionData>, _loginFlowId: string, event: AuthEvent): void {
		const message: OutboundWebMessage = {
			sessionId: "_auth",
			event,
		};
		ws.send(JSON.stringify(message));
	}

	private sendAuthResponse(ws: ServerWebSocket<ConnectionData>, response: RpcResponse): void {
		const message: OutboundWebMessage = {
			sessionId: "_auth",
			event: response,
		};
		ws.send(JSON.stringify(message));
	}

	// ─── Session subscription ──────────────────────────────────────────────────

	private subscribeToSession(session: AgentSession, ws: ServerWebSocket<ConnectionData>): void {
		const sessionId = session.sessionId;

		// Track session
		this.sessions.set(sessionId, session);

		// Add connection to subscription set
		let subscribers = this.sessionSubscriptions.get(sessionId);
		if (!subscribers) {
			subscribers = new Set();
			this.sessionSubscriptions.set(sessionId, subscribers);
		}
		subscribers.add(ws);

		// Subscribe to session events if not already subscribed
		if (!this.sessionUnsubscribers.has(sessionId)) {
			const unsubscribe = session.subscribe((event) => {
				this.broadcastEvent(sessionId, event);
			});
			this.sessionUnsubscribers.set(sessionId, unsubscribe);
		}
	}

	private broadcastEvent(sessionId: string, event: AgentSessionEvent): void {
		const subscribers = this.sessionSubscriptions.get(sessionId);
		if (!subscribers) return;

		const message: OutboundWebMessage = { sessionId, event };
		const json = JSON.stringify(message);

		for (const ws of subscribers) {
			try {
				ws.send(json);
			} catch (err) {
				console.error("[web] Failed to send event:", err);
			}
		}
	}

	// ─── Extension UI handling ─────────────────────────────────────────────────

	private handleExtensionUIResponse(response: RpcExtensionUIResponse): void {
		const pending = this.pendingExtensionRequests.get(response.id);
		if (!pending) {
			console.warn(`[web] Received extension UI response for unknown request: ${response.id}`);
			return;
		}

		this.pendingExtensionRequests.delete(response.id);

		// Forward response to the session's extension runtime
		// This is handled by the extension runtime's pending request map
		// We just need to route it back through the session

		// For now, log a warning - full extension UI support needs more plumbing
		console.warn("[web] Extension UI responses not yet fully implemented");
	}

	// ─── Helpers ───────────────────────────────────────────────────────────────

	private sendResponse(
		ws: ServerWebSocket<ConnectionData>,
		sessionId: string | undefined,
		response: RpcResponse,
	): void {
		if (!sessionId) {
			// Special case for responses without session context
			ws.send(JSON.stringify(response));
			return;
		}

		const message: OutboundWebMessage = { sessionId, event: response };
		ws.send(JSON.stringify(message));
	}

	private sendError(
		ws: ServerWebSocket<ConnectionData>,
		sessionId: string | undefined,
		command: string,
		error: string,
		commandId?: string,
	): void {
		const response: RpcResponse = {
			id: commandId,
			type: "response",
			command,
			success: false,
			error,
		};
		this.sendResponse(ws, sessionId, response);
	}
}

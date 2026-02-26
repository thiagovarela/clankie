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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
import { type AgentSession, type AgentSessionEvent, AuthStorage } from "@mariozechner/pi-coding-agent";
import type { ServerWebSocket } from "bun";
import { getAppDir, getAuthPath, loadConfig } from "../config.ts";
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
	/** Path to built web-ui static files (enables same-origin serving) */
	staticDir?: string;
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
	| { id?: string; type: "upload_attachment"; fileName: string; data: string; mimeType: string }
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
	| { id?: string; type: "get_extensions" }
	| { id?: string; type: "get_skills" }
	| { id?: string; type: "install_package"; source: string; local?: boolean }
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
				const isWebSocket = req.headers.get("Upgrade")?.toLowerCase() === "websocket";

				// ─── WebSocket upgrade path ───────────────────────────────────────

				if (isWebSocket) {
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

					// ─── Origin validation ────────────────────────────────────────

					// When staticDir is set, enforce same-origin by comparing Origin vs Host
					if (this.options.staticDir) {
						const origin = req.headers.get("Origin");
						const host = req.headers.get("Host");

						if (!origin || !host) {
							return new Response("Forbidden - missing headers", { status: 403 });
						}

						try {
							const originHost = new URL(origin).host;
							// Compare hostnames (ignoring scheme — reverse proxy handles TLS)
							if (originHost !== host) {
								console.warn(`[web] Blocked cross-origin WebSocket: origin=${origin}, host=${host}`);
								return new Response("Forbidden - cross-origin not allowed", { status: 403 });
							}
						} catch (err) {
							console.error("[web] Invalid Origin header:", err);
							return new Response("Forbidden - invalid origin", { status: 403 });
						}
					}
					// Legacy allowedOrigins check (still works as override when staticDir is not set)
					else if (this.options.allowedOrigins && this.options.allowedOrigins.length > 0) {
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
				}

				// ─── Static file serving path ─────────────────────────────────────

				if (this.options.staticDir) {
					return this.serveStaticFile(req);
				}

				// ─── No static dir configured — reject non-WebSocket requests ─────

				return new Response("Upgrade Required - this endpoint only accepts WebSocket connections", {
					status: 426,
					headers: { Upgrade: "websocket" },
				});
			},
		});

		console.log(`[web] WebSocket server listening on port ${this.options.port}`);
		console.log(`[web] Open in browser: http://localhost:${this.options.port}?token=${this.options.authToken}`);
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
				console.log(`[web] Creating new session with chatKey: ${chatKey}`);
				const session = await getOrCreateSession(chatKey, config);
				console.log(
					`[web] After getOrCreateSession - session.sessionId: ${session.sessionId}, sessionFile: ${session.sessionFile}`,
				);

				const options = command.parentSession ? { parentSession: command.parentSession } : undefined;
				const cancelled = !(await session.newSession(options));
				console.log(
					`[web] After session.newSession() - session.sessionId: ${session.sessionId}, sessionFile: ${session.sessionFile}`,
				);

				// Subscribe using the chatKey (not session.sessionId) for consistency
				this.subscribeToSessionWithKey(chatKey, session, ws);

				// Return the chatKey as sessionId so client uses it for future commands
				console.log(`[web] Returning sessionId to client: ${chatKey}, cancelled: ${cancelled}`);
				this.sendResponse(ws, chatKey, {
					id: commandId,
					type: "response",
					command: "new_session",
					success: true,
					data: { sessionId: chatKey, cancelled },
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
				const sessions = await this.listAllSessions();

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

			// Get existing session or try to restore from disk
			// Note: sessionId here is the chatKey (web_xxx), not the internal session ID
			let session = this.sessions.get(sessionId);
			if (!session) {
				// Try to restore session from disk
				try {
					const config = loadConfig();
					console.log(`[web] Restoring session from disk - chatKey: ${sessionId}`);
					session = await getOrCreateSession(sessionId, config);
					console.log(
						`[web] After restore - chatKey: ${sessionId}, session.sessionId: ${session.sessionId}, sessionFile: ${session.sessionFile}`,
					);
					this.subscribeToSessionWithKey(sessionId, session, ws);
					console.log(`[web] Restored session from disk: ${sessionId}`);
				} catch (_err) {
					this.sendError(ws, sessionId, command.type, `Session not found: ${sessionId}`, commandId);
					return;
				}
			} else {
				// Ensure this ws is subscribed (handles reconnection with new ws)
				this.subscribeToSessionWithKey(sessionId, session, ws);
				console.log(
					`[web] Using cached session - chatKey: ${sessionId}, session.sessionId: ${session.sessionId}, sessionFile: ${session.sessionFile}`,
				);
			}

			// Execute command (mirrors rpc-mode.ts logic)
			const response = await this.executeCommand(sessionId, session, command);
			this.sendResponse(ws, sessionId, response);
		} catch (err) {
			console.error("[web] Command error:", err);
			this.sendError(ws, inbound.sessionId, command.type, err instanceof Error ? err.message : String(err), commandId);
		}
	}

	private async executeCommand(sessionId: string, session: AgentSession, command: RpcCommand): Promise<RpcResponse> {
		const id = command.id;

		switch (command.type) {
			case "prompt": {
				console.log(
					`[web] Executing prompt - session.sessionId: ${session.sessionId}, sessionFile: ${session.sessionFile}`,
				);
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
				console.log(
					`[web] After prompt - session.sessionId: ${session.sessionId}, sessionFile: ${session.sessionFile}`,
				);
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

			case "upload_attachment": {
				const { fileName, data, mimeType } = command;

				// Save attachment to disk
				const { mkdirSync, writeFileSync } = await import("node:fs");
				const { join } = await import("node:path");

				// Use sessionId (which is the chatKey like web_xxx) to organize attachments
				const dir = join(getAppDir(), "attachments", sessionId);
				mkdirSync(dir, { recursive: true });

				// Create a unique filename with timestamp
				const timestamp = Date.now();
				const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
				const uniqueFileName = `${timestamp}_${sanitizedName}`;
				const filePath = join(dir, uniqueFileName);

				// Write the base64 data to disk
				writeFileSync(filePath, Buffer.from(data, "base64"));

				console.log(`[web] Saved attachment: ${filePath} (${mimeType})`);

				return {
					id,
					type: "response",
					command: "upload_attachment",
					success: true,
					data: { path: filePath, fileName: uniqueFileName },
				};
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
				console.log(`[web] Setting model for session ${sessionId}:`, model);
				await session.setModel(model);
				console.log(`[web] Model set successfully for session ${sessionId}`);

				// Manually broadcast model_changed event (pi SDK may not emit it automatically)
				this.broadcastEvent(sessionId, {
					type: "model_changed",
					model: model,
				});

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

				// Manually broadcast thinking_level_changed event
				this.broadcastEvent(sessionId, {
					type: "thinking_level_changed",
					level: command.level,
				});

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

			case "get_extensions": {
				const extensionsResult = session.resourceLoader.getExtensions();
				const extensions = extensionsResult.extensions.map((ext) => ({
					path: ext.path,
					resolvedPath: ext.resolvedPath,
					tools: Array.from(ext.tools.keys()),
					commands: Array.from(ext.commands.keys()),
					flags: Array.from(ext.flags.keys()),
					shortcuts: Array.from(ext.shortcuts.keys()),
				}));

				return {
					id,
					type: "response",
					command: "get_extensions",
					success: true,
					data: {
						extensions,
						errors: extensionsResult.errors,
					},
				};
			}

			case "get_skills": {
				const skillsResult = session.resourceLoader.getSkills();
				const skills = skillsResult.skills.map((skill) => ({
					name: skill.name,
					description: skill.description,
					filePath: skill.filePath,
					baseDir: skill.baseDir,
					source: skill.source,
					disableModelInvocation: skill.disableModelInvocation,
				}));

				return {
					id,
					type: "response",
					command: "get_skills",
					success: true,
					data: {
						skills,
						diagnostics: skillsResult.diagnostics,
					},
				};
			}

			case "install_package": {
				const { source, local } = command;
				const installCommand = `pi install ${local ? "-l " : ""}${source}`;

				try {
					// Run pi install via bash
					const result = await session.executeBash(installCommand);

					if (result.exitCode === 0) {
						// Successful install - reload the session to pick up new extensions/skills
						await session.reload();

						return {
							id,
							type: "response",
							command: "install_package",
							success: true,
							data: {
								output: result.output,
								exitCode: result.exitCode,
							},
						};
					}

					// Non-zero exit code - return as success but with exitCode info
					return {
						id,
						type: "response",
						command: "install_package",
						success: true,
						data: {
							output: result.output,
							exitCode: result.exitCode,
						},
					};
				} catch (err) {
					return {
						id,
						type: "response",
						command: "install_package",
						success: false,
						error: err instanceof Error ? err.message : String(err),
					};
				}
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

	private subscribeToSessionWithKey(chatKey: string, session: AgentSession, ws: ServerWebSocket<ConnectionData>): void {
		// Track session with the chatKey (web_xxx)
		this.sessions.set(chatKey, session);

		// Add connection to subscription set
		let subscribers = this.sessionSubscriptions.get(chatKey);
		if (!subscribers) {
			subscribers = new Set();
			this.sessionSubscriptions.set(chatKey, subscribers);
		}
		subscribers.add(ws);

		// Subscribe to session events if not already subscribed
		if (!this.sessionUnsubscribers.has(chatKey)) {
			const unsubscribe = session.subscribe((event) => {
				this.broadcastEvent(chatKey, event);
			});
			this.sessionUnsubscribers.set(chatKey, unsubscribe);
		}
	}

	private broadcastEvent(sessionId: string, event: AgentSessionEvent): void {
		const subscribers = this.sessionSubscriptions.get(sessionId);
		if (!subscribers) {
			console.log(`[web] No subscribers for session ${sessionId}, event ${event.type}`);
			return;
		}

		console.log(`[web] Broadcasting event ${event.type} to ${subscribers.size} subscribers for session ${sessionId}`);
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

	/**
	 * Extract title from a session directory by reading the last user message from JSONL files
	 */
	private getSessionTitleFromDisk(sessionPath: string): string | undefined {
		try {
			// Find the most recent .jsonl file
			const files = readdirSync(sessionPath)
				.filter((f) => f.endsWith(".jsonl"))
				.map((f) => ({
					name: f,
					path: join(sessionPath, f),
					mtime: statSync(join(sessionPath, f)).mtime.getTime(),
				}))
				.sort((a, b) => b.mtime - a.mtime);

			if (files.length === 0) return undefined;

			// Read the most recent file and parse JSONL
			const content = readFileSync(files[0].path, "utf-8");
			const lines = content.trim().split("\n");

			// Find the last user message
			let lastUserMessage: string | undefined;
			for (let i = lines.length - 1; i >= 0; i--) {
				try {
					const entry = JSON.parse(lines[i]);
					if (entry.type === "message" && entry.message?.role === "user") {
						// Extract text content
						const textContent = entry.message.content
							?.filter((c: any) => c.type === "text")
							.map((c: any) => c.text)
							.join(" ");
						if (textContent) {
							lastUserMessage = textContent.substring(0, 100);
							break;
						}
					}
				} catch {}
			}

			return lastUserMessage;
		} catch (_err) {
			return undefined;
		}
	}

	private async listAllSessions(): Promise<Array<{ sessionId: string; title?: string; messageCount: number }>> {
		const sessions: Array<{ sessionId: string; title?: string; messageCount: number }> = [];
		const sessionsDir = join(getAppDir(), "sessions");

		if (!existsSync(sessionsDir)) {
			return sessions;
		}

		try {
			// Get all web_* session directories
			const dirs = readdirSync(sessionsDir);
			const webSessions = dirs
				.filter((dir) => dir.startsWith("web_"))
				.map((dir) => ({ sessionId: dir, path: join(sessionsDir, dir) }))
				.filter(({ path }) => {
					try {
						return statSync(path).isDirectory();
					} catch {
						return false;
					}
				})
				// Sort by modification time, newest first
				.sort((a, b) => {
					try {
						const aMtime = statSync(a.path).mtime.getTime();
						const bMtime = statSync(b.path).mtime.getTime();
						return bMtime - aMtime;
					} catch {
						return 0;
					}
				});

			// For each session directory, check if it's in memory or read from disk
			for (const { sessionId, path } of webSessions) {
				const inMemorySession = this.sessions.get(sessionId);

				if (inMemorySession) {
					// Use in-memory session data
					// Get the last user message as the title (like pi's /resume command)
					const lastUserMessage = [...inMemorySession.messages].reverse().find((msg) => msg.role === "user");

					let title: string | undefined;
					if (lastUserMessage) {
						// Extract text from content
						if (typeof lastUserMessage.content === "string") {
							title = lastUserMessage.content.substring(0, 100);
						} else if (Array.isArray(lastUserMessage.content)) {
							const textContent = lastUserMessage.content
								.filter((c: any) => c.type === "text")
								.map((c: any) => c.text)
								.join(" ");
							title = textContent?.substring(0, 100) || inMemorySession.sessionName;
						}
					}

					if (!title) {
						title = inMemorySession.sessionName;
					}

					sessions.push({
						sessionId,
						title,
						messageCount: inMemorySession.messages.length,
					});
				} else {
					// For sessions not in memory, read title from disk
					const title = this.getSessionTitleFromDisk(path);

					sessions.push({
						sessionId,
						title,
						messageCount: 0, // We don't count messages for sessions not in memory
					});
				}
			}
		} catch (err) {
			console.error("[web] Failed to list sessions:", err);
		}

		return sessions;
	}

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

	// ─── Static file serving ───────────────────────────────────────────────────

	private async serveStaticFile(req: Request): Promise<Response> {
		if (!this.options.staticDir) {
			return new Response("Not Found", { status: 404 });
		}

		try {
			const url = new URL(req.url);
			let pathname = url.pathname;

			// Remove leading slash
			if (pathname.startsWith("/")) {
				pathname = pathname.substring(1);
			}

			// Default to index for root
			if (pathname === "" || pathname === "/") {
				pathname = "_shell.html";
			}

			// Try to serve the requested file
			const filePath = join(this.options.staticDir, pathname);

			// Security: ensure the resolved path is within staticDir (prevent directory traversal)
			const { resolve } = await import("node:path");
			const resolvedPath = resolve(this.options.staticDir, pathname);
			if (!resolvedPath.startsWith(resolve(this.options.staticDir))) {
				return new Response("Forbidden", { status: 403 });
			}

			// Check if file exists
			if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
				const file = Bun.file(resolvedPath);

				// Set caching headers for hashed assets
				const headers = new Headers();
				if (pathname.startsWith("assets/")) {
					headers.set("Cache-Control", "public, max-age=31536000, immutable");
				} else {
					headers.set("Cache-Control", "public, max-age=3600");
				}

				return new Response(file, { headers });
			}

			// SPA fallback: serve _shell.html for non-file routes
			const shellPath = join(this.options.staticDir, "_shell.html");
			if (existsSync(shellPath)) {
				const file = Bun.file(shellPath);
				return new Response(file, {
					headers: {
						"Content-Type": "text/html",
						"Cache-Control": "no-cache",
					},
				});
			}

			return new Response("Not Found", { status: 404 });
		} catch (err) {
			console.error("[web] Error serving static file:", err);
			return new Response("Internal Server Error", { status: 500 });
		}
	}
}

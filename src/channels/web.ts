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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { Http2Server, Http2SecureServer } from "node:http2";
import { basename, dirname, join, resolve } from "node:path";
import { serve } from "@hono/node-server";

/** Server type from @hono/node-server (includes HTTP/2) */
type ServerType = Server | Http2Server | Http2SecureServer;
import type { WebSocket, WebSocketServer } from "ws";
import { createNodeWebSocket } from "@hono/node-ws";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
import {
	type AgentSession,
	type AgentSessionEvent,
	AuthStorage,
	DefaultPackageManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { Hono } from "hono";
import { parse as parseCookie, serialize as serializeCookie } from "hono/utils/cookie";
import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { buildApiKeyProviders } from "../auth/providers.ts";
import { getAgentDir, getAppDir, getAuthPath, getWorkspace, loadConfig } from "../config.ts";
import { reloadSharedHeartbeatRunnerSettings } from "../extensions/heartbeat/index.ts";
import { HEARTBEAT_EXTENSION_UI_SPEC } from "../extensions/heartbeat/ui-spec.ts";
import { resolveScopedModels } from "../lib/scoped-model-resolver.ts";
import {
	type Notification,
	createNotification,
	getNotifications,
	markRead,
	markAllRead,
	dismissNotification,
	dismissAll,
	setBroadcastCallback,
} from "../notifications.ts";
import { getOrCreateSession, reloadAllSessions } from "../sessions.ts";
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

/** Notification event for real-time delivery */
interface NotificationEvent {
	type: "notification";
	notification: Notification;
}

/** Extended session events including custom events */
type ExtendedAgentSessionEvent =
	| AgentSessionEvent
	| { type: "model_changed"; model: { provider: string; id: string } }
	| { type: "thinking_level_changed"; level: ThinkingLevel };

/** Outbound message to client */
interface OutboundWebMessage {
	sessionId: string; // "_auth" for auth events, "_notifications" for notification events
	event: ExtendedAgentSessionEvent | RpcResponse | RpcExtensionUIRequest | AuthEvent | NotificationEvent;
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
	| { id?: string; type: "get_extension_config"; extensionPath: string }
	| {
			id?: string;
			type: "set_extension_config";
			extensionPath: string;
			config: Record<string, unknown>;
	  }
	| {
			id?: string;
			type: "extension_ui_action";
			extensionPath: string;
			action: string;
			params: Record<string, unknown>;
	  }
	| { id?: string; type: "get_skills" }
	| { id?: string; type: "install_package"; source: string; local?: boolean }
	| { id?: string; type: "reload" }
	| { id?: string; type: "get_auth_providers" }
	| { id?: string; type: "auth_login"; providerId: string }
	| { id?: string; type: "auth_set_api_key"; providerId: string; apiKey: string }
	| { id?: string; type: "auth_login_input"; loginFlowId: string; value: string }
	| { id?: string; type: "auth_login_cancel"; loginFlowId: string }
	| { id?: string; type: "auth_logout"; providerId: string }
	| { id?: string; type: "get_scoped_models" }
	| { id?: string; type: "set_scoped_models"; models: string[] }  // "provider/modelId" strings
	// Notifications
	| { id?: string; type: "get_notifications" }
	| { id?: string; type: "mark_notification_read"; notificationId: string }
	| { id?: string; type: "mark_all_notifications_read" }
	| { id?: string; type: "dismiss_notification"; notificationId: string }
	| { id?: string; type: "dismiss_all_notifications" };

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

interface ExtensionUISpec {
	root: string;
	elements: Record<string, unknown>;
	actions?: Record<string, { description?: string }>;
}

interface ExtensionDescriptor {
	path: string;
	resolvedPath: string;
	tools: Map<string, unknown>;
	commands: Map<string, unknown>;
	flags: Map<string, unknown>;
	shortcuts: Map<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidExtensionUISpec(value: unknown): value is ExtensionUISpec {
	if (!isRecord(value)) {
		return false;
	}

	if (typeof value.root !== "string" || !isRecord(value.elements)) {
		return false;
	}

	if (value.actions !== undefined && !isRecord(value.actions)) {
		return false;
	}

	return true;
}

function tryReadJson(filePath: string): unknown | undefined {
	try {
		const raw = readFileSync(filePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function findPackageRoot(startDir: string): string | undefined {
	let current = resolve(startDir);

	while (true) {
		const packageJsonPath = join(current, "package.json");
		if (existsSync(packageJsonPath)) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function getUiSpecCandidatePaths(extensionPath: string, resolvedPath: string): string[] {
	const candidates = new Set<string>();

	for (const pathValue of [resolvedPath, extensionPath]) {
		if (!pathValue || pathValue.startsWith("<inline:")) {
			continue;
		}

		const absolutePath = resolve(pathValue);
		if (!existsSync(absolutePath)) {
			continue;
		}

		if (statSync(absolutePath).isFile()) {
			candidates.add(`${absolutePath}.ui.json`);
			candidates.add(join(dirname(absolutePath), "ui-spec.json"));
			const packageRoot = findPackageRoot(dirname(absolutePath));
			if (packageRoot) {
				candidates.add(join(packageRoot, "ui-spec.json"));
			}
			continue;
		}

		if (statSync(absolutePath).isDirectory()) {
			candidates.add(join(absolutePath, "ui-spec.json"));
			const packageRoot = findPackageRoot(absolutePath);
			if (packageRoot) {
				candidates.add(join(packageRoot, "ui-spec.json"));
			}
		}
	}

	return Array.from(candidates);
}

function resolveInlineExtensionUiSpec(ext: ExtensionDescriptor): ExtensionUISpec | undefined {
	const commandNames = Array.from(ext.commands.keys());
	const flagNames = Array.from(ext.flags.keys());
	const isHeartbeatExtension = commandNames.includes("heartbeat") || flagNames.includes("heartbeat");
	return isHeartbeatExtension ? HEARTBEAT_EXTENSION_UI_SPEC : undefined;
}

function resolveExtensionUiSpec(ext: ExtensionDescriptor): ExtensionUISpec | undefined {
	if (ext.path.startsWith("<inline:")) {
		return resolveInlineExtensionUiSpec(ext);
	}

	for (const candidatePath of getUiSpecCandidatePaths(ext.path, ext.resolvedPath)) {
		if (!existsSync(candidatePath) || !statSync(candidatePath).isFile()) {
			continue;
		}

		const parsed = tryReadJson(candidatePath);
		if (isValidExtensionUISpec(parsed)) {
			return parsed;
		}
	}

	return undefined;
}

function isHeartbeatExtension(ext: ExtensionDescriptor): boolean {
	const commandNames = Array.from(ext.commands.keys());
	const flagNames = Array.from(ext.flags.keys());
	return commandNames.includes("heartbeat") || flagNames.includes("heartbeat");
}

const PROJECT_SETTINGS_PATH = [".pi", "settings.json"] as const;

function getProjectSettingsPath(cwd: string): string {
	return join(cwd, ...PROJECT_SETTINGS_PATH);
}

function readProjectSettings(cwd: string): Record<string, unknown> {
	const settingsPath = getProjectSettingsPath(cwd);
	if (!existsSync(settingsPath)) {
		return {};
	}

	try {
		const content = readFileSync(settingsPath, "utf8");
		const parsed = JSON.parse(content);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function writeProjectSettings(cwd: string, settings: Record<string, unknown>): void {
	const settingsPath = getProjectSettingsPath(cwd);
	mkdirSync(dirname(settingsPath), { recursive: true });
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function sanitizeNamespace(input: string): string {
	return input
		.toLowerCase()
		.replace(/^@/, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

function getExtensionNamespace(ext: ExtensionDescriptor): string {
	if (isHeartbeatExtension(ext)) {
		return "clankie-heartbeat";
	}

	const fromPath = sanitizeNamespace(ext.path);
	if (fromPath) {
		return fromPath;
	}

	return sanitizeNamespace(basename(ext.resolvedPath)) || "extension-config";
}

function normalizeExtensionUiConfig(namespace: string, config: Record<string, unknown>): Record<string, unknown> {
	if (namespace !== "clankie-heartbeat") {
		return config;
	}

	const model = typeof config.model === "string" ? config.model.trim() : config.model;
	return {
		enabled: Boolean(config.enabled),
		every: String(config.every ?? ""),
		model: model === "" || model === "(default session model)" || model == null ? null : model,
	};
}

function getExtensionUiConfig(cwd: string, ext: ExtensionDescriptor): Record<string, unknown> {
	const settings = readProjectSettings(cwd);
	const namespace = getExtensionNamespace(ext);
	const namespaceValue = settings[namespace];
	return isRecord(namespaceValue) ? namespaceValue : {};
}

function setExtensionUiConfig(
	cwd: string,
	ext: ExtensionDescriptor,
	config: Record<string, unknown>,
): Record<string, unknown> {
	const settings = readProjectSettings(cwd);
	const namespace = getExtensionNamespace(ext);
	const nextConfig = normalizeExtensionUiConfig(namespace, config);
	const currentNamespaceValue = settings[namespace];
	const currentNamespaceConfig = isRecord(currentNamespaceValue) ? currentNamespaceValue : {};
	settings[namespace] = {
		...currentNamespaceConfig,
		...nextConfig,
	};
	writeProjectSettings(cwd, settings);
	const saved = settings[namespace];
	return isRecord(saved) ? saved : {};
}

function applyExtensionConfigSideEffects(cwd: string, ext: ExtensionDescriptor): void {
	if (isHeartbeatExtension(ext)) {
		reloadSharedHeartbeatRunnerSettings(cwd);
	}
}

// ─── WebChannel ────────────────────────────────────────────────────────────────

/** Cookie name for auth token (HttpOnly, same-origin) */
const AUTH_COOKIE_NAME = "clankie_auth";

/** Cookie max age: 30 days in seconds */
const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Build cookie options based on request protocol.
 * Secure flag is only set for HTTPS connections.
 */
function getCookieOptions(c: { req: { header: (name: string) => string | undefined } }): {
	httpOnly: boolean;
	sameSite: "Strict" | "Lax" | "None";
	secure: boolean;
	path: string;
	maxAge: number;
} {
	const protocol = c.req.header("x-forwarded-proto") || c.req.header("protocol") || "http";
	const isHttps = protocol === "https";

	return {
		httpOnly: true,
		sameSite: "Lax" as const,
		secure: isHttps,
		path: "/",
		maxAge: AUTH_COOKIE_MAX_AGE,
	};
}

/**
 * Set a cookie on the response using Hono's context.
 */
function setAuthCookie(
	c: { header: (name: string, value: string, options?: { append?: boolean }) => void },
	name: string,
	value: string,
	options: ReturnType<typeof getCookieOptions>,
): void {
	const cookieValue = serializeCookie(name, value, {
		...options,
		httpOnly: true,
		sameSite: options.sameSite,
		secure: options.secure,
		path: options.path,
		maxAge: options.maxAge,
	});
	c.header("Set-Cookie", cookieValue);
}

/**
 * Delete a cookie by setting it with an expired maxAge.
 */
function deleteAuthCookie(
	c: { header: (name: string, value: string, options?: { append?: boolean }) => void },
	name: string,
): void {
	const cookieValue = serializeCookie(name, "", {
		path: "/",
		maxAge: 0,
	});
	c.header("Set-Cookie", cookieValue);
}

/**
 * Validate auth token from various sources (cookie, query param, header).
 * Returns the token if valid, undefined otherwise.
 */
function getValidAuthToken(
	c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } },
	validToken: string,
): string | undefined {
	// 1. Try Authorization header (Bearer token)
	const authHeader = c.req.header("Authorization");
	if (authHeader) {
		const headerToken = authHeader.replace(/^Bearer\s+/i, "");
		if (headerToken === validToken) {
			return headerToken;
		}
	}

	// 2. Try HttpOnly cookie (set by /api/auth/login)
	const cookieHeader = c.req.header("Cookie");
	if (cookieHeader) {
		const cookies = parseCookie(cookieHeader);
		const cookieToken = cookies[AUTH_COOKIE_NAME];
		if (cookieToken === validToken) {
			return cookieToken;
		}
	}

	// 3. Try query parameter (legacy, for backward compatibility)
	const queryToken = c.req.query("token");
	if (queryToken === validToken) {
		return queryToken;
	}

	return undefined;
}

export class WebChannel implements Channel {
	readonly name = "web";
	private options: WebChannelOptions;
	private server: ServerType | null = null;
	private wss: WebSocketServer | null = null;

	/** Map of sessionId → Set of WebSocket connections subscribed to that session */
	private sessionSubscriptions = new Map<string, Set<WSContext>>();

	/** Map of sessionId → AgentSession */
	private sessions = new Map<string, AgentSession>();

	/** Map of sessionId → unsubscribe function for session event listener */
	private sessionUnsubscribers = new Map<string, () => void>();

	/** Pending extension UI requests: Map<requestId, { sessionId, ws }> */
	private pendingExtensionRequests = new Map<string, { sessionId: string; ws: WSContext }>();

	/** Pending auth login flows: Map<loginFlowId, { ws, inputResolver, abortController }> */
	private pendingLoginFlows = new Map<
		string,
		{
			ws: WSContext;
			inputResolver: ((value: string) => void) | null;
			abortController: AbortController;
		}
	>();

	/** All connected WebSocket clients (for broadcasting) */
	private allConnections = new Set<WSContext>();

	/** Heartbeat interval for keeping WebSocket connections alive */
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

	/** Notification broadcast callback cleanup function */
	private notificationCleanup: (() => void) | null = null;

	constructor(options: WebChannelOptions) {
		this.options = options;
	}

	async start(_handler: MessageHandler): Promise<void> {
		const app = new Hono();

		// Create WebSocket adapter
		const { wss, injectWebSocket, upgradeWebSocket: wsUpgrade } = createNodeWebSocket({ app });
		this.wss = wss;

		// ─── WebSocket route ──────────────────────────────────────────────────
		// Note: upgradeWebSocket() handles WebSocket upgrade requests at the root path
		// Regular HTTP requests fall through to static file serving

		// Define the WebSocket handler with proper typing
		const wsHandler = (c: Context) => {
				// Validate auth token from Authorization header, cookie, or URL query param
				const token = getValidAuthToken(c, this.options.authToken);

				if (!token) {
					return c.text("Unauthorized", 401);
				}

				// ─── Origin validation ────────────────────────────────────────

				// When staticDir is set, we serve same-origin by default
				// But allow cross-origin if properly authenticated (for development/dev servers)
				if (this.options.staticDir) {
					const origin = c.req.header("Origin");
					const host = c.req.header("Host");

					// If there's no Origin header, it's a same-origin request (allow)
					// If there is an Origin, check if it matches or if we have valid auth
					if (origin && host) {
						try {
							const originHost = new URL(origin).host;
							if (originHost !== host) {
								// Cross-origin request with valid auth - allow it
								// This enables development setups with separate dev server
								console.log(`[web] Allowing cross-origin WebSocket: origin=${origin}, host=${host}`);
							}
						} catch (err) {
							console.error("[web] Invalid Origin header:", err);
							// Allow anyway if we have valid auth
						}
					}
				}
				// Legacy allowedOrigins check (still works as override when staticDir is not set)
				else if (this.options.allowedOrigins && this.options.allowedOrigins.length > 0) {
					const origin = c.req.header("Origin");
					if (!origin || !this.options.allowedOrigins.includes(origin)) {
						return c.text("Forbidden", 403);
					}
				}

				// Return WebSocket handlers
				return {
					onOpen: (_evt: Event, ws: WSContext<WebSocket>) => {
						console.log("[web] Client connected");
						this.allConnections.add(ws);
					},
					onMessage: async (evt: MessageEvent, ws: WSContext<WebSocket>) => {
						try {
							const text = typeof evt.data === "string" ? evt.data : evt.data.toString();
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
					},
					onClose: (_evt: CloseEvent, ws: WSContext<WebSocket>) => {
						console.log("[web] Client disconnected");
						this.allConnections.delete(ws);

						// Remove this connection from all session subscriptions
						for (const [sessionId, subscribers] of this.sessionSubscriptions.entries()) {
							subscribers.delete(ws);
							if (subscribers.size === 0) {
								this.sessionSubscriptions.delete(sessionId);
							}
						}
					},
				};
			};
		app.get("/", wsUpgrade(wsHandler as any));

		// ─── Auth API endpoints ─────────────────────────────────────────────
		// Note: These endpoints need CORS headers for cross-origin access

		const addCorsHeaders = (c: { header: (name: string, value: string) => void }) => {
			c.header("Access-Control-Allow-Origin", "*");
			c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			c.header("Access-Control-Allow-Headers", "Content-Type");
		};

		// Check if cookie auth is valid
		app.get("/api/auth/check", (c) => {
			addCorsHeaders(c);
			const token = getValidAuthToken(c, this.options.authToken);
			if (token) {
				return c.json({ authenticated: true });
			}
			return c.json({ authenticated: false });
		});

		// Login with token, sets HttpOnly cookie
		app.post("/api/auth/login", async (c) => {
			addCorsHeaders(c);
			try {
				const body = await c.req.json<{ token?: string }>();
				const providedToken = body.token;

				if (!providedToken) {
					return c.json({ success: false, error: "Token is required" }, 400);
				}

				if (providedToken !== this.options.authToken) {
					return c.json({ success: false, error: "Invalid token" }, 401);
				}

				// Set the HttpOnly cookie
				setAuthCookie(c, AUTH_COOKIE_NAME, providedToken, getCookieOptions(c));

				return c.json({ success: true });
			} catch (err) {
				console.error("[web] /api/auth/login error:", err);
				return c.json({ success: false, error: "Internal server error" }, 500);
			}
		});

		// Logout - clear the auth cookie
		app.post("/api/auth/logout", (c) => {
			addCorsHeaders(c);
			deleteAuthCookie(c, AUTH_COOKIE_NAME);
			return c.json({ success: true });
		});

		// ─── Static file serving ──────────────────────────────────────────────

		if (this.options.staticDir) {
			app.get("*", async (c) => {
				try {
					let pathname = c.req.path;

					// Remove leading slash
					if (pathname.startsWith("/")) {
						pathname = pathname.substring(1);
					}

					// Default to index for root
					if (pathname === "" || pathname === "/") {
						pathname = "_shell.html";
					}

					// Try to serve the requested file
					const _filePath = join(this.options.staticDir!, pathname);

					// Security: ensure the resolved path is within staticDir (prevent directory traversal)
					const resolvedPath = resolve(this.options.staticDir!, pathname);
					if (!resolvedPath.startsWith(resolve(this.options.staticDir!))) {
						return c.text("Forbidden", 403);
					}

					// Check if file exists
					if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
						const content = readFileSync(resolvedPath);

						// Determine Content-Type from extension
						const ext = pathname.split(".").pop()?.toLowerCase();
						const contentTypes: Record<string, string> = {
							html: "text/html",
							js: "application/javascript",
							css: "text/css",
							json: "application/json",
							png: "image/png",
							jpg: "image/jpeg",
							jpeg: "image/jpeg",
							gif: "image/gif",
							svg: "image/svg+xml",
							webp: "image/webp",
							woff: "font/woff",
							woff2: "font/woff2",
							ttf: "font/ttf",
							ico: "image/x-icon",
						};

						const contentType = contentTypes[ext || ""] || "application/octet-stream";

						// Set caching headers for hashed assets
						const cacheControl = pathname.startsWith("assets/")
							? "public, max-age=31536000, immutable"
							: "public, max-age=3600";

						return new Response(content, {
							headers: {
								"Content-Type": contentType,
								"Cache-Control": cacheControl,
							},
						});
					}

					// SPA fallback: serve _shell.html for non-file routes
					const shellPath = join(this.options.staticDir!, "_shell.html");
					if (existsSync(shellPath)) {
						const content = readFileSync(shellPath);
						return new Response(content, {
							headers: {
								"Content-Type": "text/html",
								"Cache-Control": "no-cache",
							},
						});
					}

					return c.text("Not Found", 404);
				} catch (err) {
					console.error("[web] Error serving static file:", err);
					return c.text("Internal Server Error", 500);
				}
			});
		} else {
			// No static dir — reject non-WebSocket requests
			app.get("*", (c) => {
				return c.text("Upgrade Required - this endpoint only accepts WebSocket connections", 426, {
					Upgrade: "websocket",
				});
			});
		}

		// ─── Start server ─────────────────────────────────────────────────────

		this.server = serve(
			{
				fetch: app.fetch,
				port: this.options.port,
			},
			(info) => {
				console.log(`[web] Server started on ${info.address}:${info.port}`);
			},
		);

		injectWebSocket(this.server);

		// ─── WebSocket keepalive (ping/pong) ──────────────────────────────────

		const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

		// Track liveness on each raw ws connection
		wss.on("connection", (ws) => {
			// biome-ignore lint/suspicious/noExplicitAny: Adding custom property for liveness tracking
			(ws as any).isAlive = true;
			ws.on("pong", () => {
				// biome-ignore lint/suspicious/noExplicitAny: Adding custom property for liveness tracking
				(ws as any).isAlive = true;
			});
		});

		// Ping all clients periodically and terminate unresponsive ones
		this.heartbeatInterval = setInterval(() => {
			for (const ws of wss.clients) {
				// biome-ignore lint/suspicious/noExplicitAny: Reading custom property for liveness tracking
				if ((ws as any).isAlive === false) {
					console.log("[web] Terminating unresponsive client");
					ws.terminate();
					continue;
				}
				// biome-ignore lint/suspicious/noExplicitAny: Setting custom property for liveness tracking
				(ws as any).isAlive = false;
				ws.ping();
			}
		}, HEARTBEAT_INTERVAL);

		console.log(`[web] WebSocket server listening on port ${this.options.port}`);
		console.log(`[web] Open in browser: http://localhost:${this.options.port}?token=${this.options.authToken}`);

		// ─── Notification broadcast setup ─────────────────────────────────────

		// Register callback to broadcast notifications to all connected clients
		const broadcastToAll = (notification: Notification) => {
			const message: OutboundWebMessage = {
				sessionId: "_notifications",
				event: { type: "notification", notification },
			};
			const json = JSON.stringify(message);

			for (const ws of this.allConnections) {
				try {
					ws.send(json);
				} catch (err) {
					console.error("[web] Failed to broadcast notification:", err);
				}
			}
		};

		setBroadcastCallback(broadcastToAll);
		this.notificationCleanup = () => setBroadcastCallback(null);
	}

	async send(_chatId: string, text: string, options?: { threadId?: string }): Promise<void> {
		// Create a notification for cron/system deliveries to the web channel.
		// Interactive chat uses direct session streaming instead.
		const title = text.split("\n")[0]?.slice(0, 100) || "Scheduled Task Result";
		const message = text.length > title.length ? text : text.slice(0, 500);
		createNotification({
			type: "info",
			source: "cron",
			title,
			message,
			metadata: {
				chatId: _chatId,
				threadId: options?.threadId,
			},
		});
	}

	async stop(): Promise<void> {
		// Stop heartbeat interval
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		// Clear notification broadcast callback
		if (this.notificationCleanup) {
			this.notificationCleanup();
			this.notificationCleanup = null;
		}

		// Clear all connections tracking
		this.allConnections.clear();

		if (this.wss) {
			for (const client of this.wss.clients) {
				try {
					client.close(1001, "Server shutting down");
				} catch {
					client.terminate();
				}
			}

			await new Promise<void>((resolve) => {
				this.wss?.close(() => resolve());
			});
			this.wss = null;
		}

		if (this.server) {
			await new Promise<void>((resolve) => {
				this.server?.close(() => resolve());
			});
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

	// ─── Command handling ──────────────────────────────────────────────────────

	private async handleCommand(ws: WSContext, inbound: InboundWebMessage): Promise<void> {
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

			// Notification commands don't need a sessionId
			if (command.type === "get_notifications") {
				const notifications = getNotifications();
				this.sendResponse(ws, undefined, {
					id: commandId,
					type: "response",
					command: "get_notifications",
					success: true,
					data: { notifications },
				});
				return;
			}

			if (command.type === "mark_notification_read") {
				const notification = markRead(command.notificationId);
				this.sendResponse(ws, undefined, {
					id: commandId,
					type: "response",
					command: "mark_notification_read",
					success: true,
					data: { notification },
				});
				return;
			}

			if (command.type === "mark_all_notifications_read") {
				const count = markAllRead();
				this.sendResponse(ws, undefined, {
					id: commandId,
					type: "response",
					command: "mark_all_notifications_read",
					success: true,
					data: { count },
				});
				return;
			}

			if (command.type === "dismiss_notification") {
				const notification = dismissNotification(command.notificationId);
				this.sendResponse(ws, undefined, {
					id: commandId,
					type: "response",
					command: "dismiss_notification",
					success: true,
					data: { notification },
				});
				return;
			}

			if (command.type === "dismiss_all_notifications") {
				const count = dismissAll();
				this.sendResponse(ws, undefined, {
					id: commandId,
					type: "response",
					command: "dismiss_all_notifications",
					success: true,
					data: { count },
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

	private injectAttachmentPaths(sessionId: string, message: string): string {
		const attachmentNames = Array.from(message.matchAll(/\[Attached:\s*([^\]]+)\]/g))
			.map((match) => match[1]?.trim())
			.filter((name): name is string => Boolean(name));

		if (attachmentNames.length === 0) return message;

		const attachmentDir = join(getAppDir(), "attachments", sessionId);
		const resolved: string[] = [];
		for (const name of attachmentNames) {
			const path = join(attachmentDir, name);
			if (existsSync(path)) {
				resolved.push(`  - ${name}: ${path}`);
			}
		}

		if (resolved.length === 0) return message;

		const suffix = `\n\n[Attached files saved to disk]\n${resolved.join("\n")}`;
		return `${message}${suffix}`;
	}

	private getSessionCwd(session: AgentSession): string {
		const maybeSessionWithCwd = session as AgentSession & { cwd?: string };
		return maybeSessionWithCwd.cwd ?? process.cwd();
	}

	private getExtensionDescriptor(session: AgentSession, requestedPath: string): ExtensionDescriptor | undefined {
		const extensions = session.resourceLoader.getExtensions().extensions as ExtensionDescriptor[];
		return extensions.find((ext) => ext.path === requestedPath || ext.resolvedPath === requestedPath);
	}

	private async executeCommand(sessionId: string, session: AgentSession, command: RpcCommand): Promise<RpcResponse> {
		const id = command.id;

		switch (command.type) {
			case "prompt": {
				console.log(
					`[web] Executing prompt - session.sessionId: ${session.sessionId}, sessionFile: ${session.sessionFile}`,
				);
				const promptWithAttachmentPaths = this.injectAttachmentPaths(sessionId, command.message);
				// Don't await - events will stream
				session
					.prompt(promptWithAttachmentPaths, {
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
				const cwd = this.getSessionCwd(session);
				const availableModels = await session.modelRegistry.getAvailable();
				const availableModelIds = [
					"(default session model)",
					...Array.from(new Set(availableModels.map((model) => `${model.provider}/${model.id}`))).sort(),
				];
				const extensions = extensionsResult.extensions
					.map((ext) => {
						const descriptor = ext as ExtensionDescriptor;
						const uiSpec = resolveExtensionUiSpec(descriptor);
						const config = getExtensionUiConfig(cwd, descriptor);
						const uiState = uiSpec
							? {
									config: {
										...config,
										model:
											typeof config.model === "string" && config.model.trim().length > 0
												? config.model
												: "(default session model)",
									},
									availableModels: availableModelIds,
									extensionPath: ext.path,
								}
							: undefined;
						return {
							path: ext.path,
							resolvedPath: ext.resolvedPath,
							tools: Array.from(ext.tools.keys()),
							commands: Array.from(ext.commands.keys()),
							flags: Array.from(ext.flags.keys()),
							shortcuts: Array.from(ext.shortcuts.keys()),
							uiSpec,
							uiState,
						};
					})
					.filter((ext) => !ext.path.startsWith("<inline:") || Boolean(ext.uiSpec));

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

			case "get_extension_config": {
				const extension = this.getExtensionDescriptor(session, command.extensionPath);
				if (!extension) {
					return {
						id,
						type: "response",
						command: "get_extension_config",
						success: false,
						error: `Unknown extension: ${command.extensionPath}`,
					};
				}

				const cwd = this.getSessionCwd(session);
				const config = getExtensionUiConfig(cwd, extension);
				return {
					id,
					type: "response",
					command: "get_extension_config",
					success: true,
					data: {
						extensionPath: extension.path,
						config,
					},
				};
			}

			case "set_extension_config": {
				const extension = this.getExtensionDescriptor(session, command.extensionPath);
				if (!extension) {
					return {
						id,
						type: "response",
						command: "set_extension_config",
						success: false,
						error: `Unknown extension: ${command.extensionPath}`,
					};
				}

				const cwd = this.getSessionCwd(session);
				const savedConfig = setExtensionUiConfig(cwd, extension, command.config);
				applyExtensionConfigSideEffects(cwd, extension);
				return {
					id,
					type: "response",
					command: "set_extension_config",
					success: true,
					data: {
						extensionPath: extension.path,
						config: savedConfig,
					},
				};
			}

			case "extension_ui_action": {
				const extension = this.getExtensionDescriptor(session, command.extensionPath);
				if (!extension) {
					return {
						id,
						type: "response",
						command: "extension_ui_action",
						success: false,
						error: `Unknown extension: ${command.extensionPath}`,
					};
				}

				const cwd = this.getSessionCwd(session);
				const savedConfig = setExtensionUiConfig(cwd, extension, command.params);
				applyExtensionConfigSideEffects(cwd, extension);
				return {
					id,
					type: "response",
					command: "extension_ui_action",
					success: true,
					data: {
						extensionPath: extension.path,
						action: command.action,
						config: savedConfig,
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
				const config = loadConfig();
				const cwd = getWorkspace(config);
				const agentDir = getAgentDir(config);
				const settingsManager = SettingsManager.create(cwd, agentDir);
				const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
				const output: string[] = [];

				packageManager.setProgressCallback((event) => {
					if (event.type === "start" && event.message) {
						output.push(event.message);
					}
					if (event.type === "error" && event.message) {
						output.push(`Error: ${event.message}`);
					}
				});

				try {
					await packageManager.install(source, { local: local === true });
					const added = packageManager.addSourceToSettings(source, { local: local === true });
					if (!added) {
						output.push(`Package source already configured: ${source}`);
					}

					// Successful install - reload all sessions to pick up new extensions/skills
					await reloadAllSessions();

					return {
						id,
						type: "response",
						command: "install_package",
						success: true,
						data: {
							output: output.join("\n") || `Installed ${source}`,
							exitCode: 0,
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

			case "reload": {
				await reloadAllSessions();
				return { id, type: "response", command: "reload", success: true };
			}

			case "get_scoped_models": {
				const enabledModels = session.settingsManager.getEnabledModels() ?? [];
				return { id, type: "response", command: "get_scoped_models", success: true,
					data: { enabledModels } };
			}

			case "set_scoped_models": {
				// 1. Persist patterns to settings.json
				const patterns = command.models.map((pattern) => pattern.trim()).filter(Boolean);
				session.settingsManager.setEnabledModels(patterns.length > 0 ? patterns : undefined);
				await session.settingsManager.flush();

				// 2. Resolve patterns to Model objects and update live session
				const available = await session.modelRegistry.getAvailable();
				const resolved = resolveScopedModels(patterns, available).map((model) => ({
					model,
					thinkingLevel: session.thinkingLevel,
				}));
				session.setScopedModels(resolved);

				const enabledModels = session.settingsManager.getEnabledModels() ?? [];
				return {
					id,
					type: "response",
					command: "set_scoped_models",
					success: true,
					data: { enabledModels },
				};
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

	private async handleAuthCommand(ws: WSContext, command: RpcCommand, commandId?: string): Promise<void> {
		const authStorage = AuthStorage.create(getAuthPath());

		try {
			switch (command.type) {
				case "get_auth_providers": {
					// Get OAuth providers from pi SDK
					const oauthProviders = authStorage.getOAuthProviders();
					const oauthIds = new Set(oauthProviders.map((p) => p.id));

					// API key providers = curated built-ins + dynamically discovered providers
					// from the loaded model registry (includes extension-registered providers).
					const apiKeyProviders = await this.getApiKeyProviders(oauthIds);

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

	private async getApiKeyProviders(oauthIds: Set<string>): Promise<Array<{ id: string; name: string }>> {
		const dynamicProviderIds = new Set<string>();

		// Discover additional providers from a loaded session model registry.
		// This captures extension-registered providers (e.g. custom proxies).
		try {
			const config = loadConfig();
			const discoverySession = await getOrCreateSession("web_auth_providers", config);
			const allModels = discoverySession.modelRegistry.getAll();
			for (const model of allModels) {
				if (model.provider) dynamicProviderIds.add(model.provider);
			}
		} catch (err) {
			console.warn(
				`[web] Failed to discover dynamic API key providers: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		return buildApiKeyProviders(oauthIds, dynamicProviderIds);
	}

	private sendAuthEvent(ws: WSContext, _loginFlowId: string, event: AuthEvent): void {
		const message: OutboundWebMessage = {
			sessionId: "_auth",
			event,
		};
		ws.send(JSON.stringify(message));
	}

	private sendAuthResponse(ws: WSContext, response: RpcResponse): void {
		const message: OutboundWebMessage = {
			sessionId: "_auth",
			event: response,
		};
		ws.send(JSON.stringify(message));
	}

	// ─── Session subscription ──────────────────────────────────────────────────

	private subscribeToSessionWithKey(chatKey: string, session: AgentSession, ws: WSContext): void {
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

	private broadcastEvent(sessionId: string, event: ExtendedAgentSessionEvent): void {
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

	private getSessionJsonlFiles(sessionPath: string): Array<{ path: string; mtime: number }> {
		try {
			return readdirSync(sessionPath)
				.filter((f) => f.endsWith(".jsonl"))
				.map((f) => {
					const filePath = join(sessionPath, f);
					try {
						return { path: filePath, mtime: statSync(filePath).mtime.getTime() };
					} catch {
						return undefined;
					}
				})
				.filter((file): file is { path: string; mtime: number } => file !== undefined)
				.sort((a, b) => b.mtime - a.mtime);
		} catch {
			return [];
		}
	}

	private parseEntryTimestampMs(value: unknown): number | undefined {
		if (typeof value !== "string") return undefined;
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	private getLatestMessageTimestampFromJsonl(filePath: string): number | undefined {
		try {
			const content = readFileSync(filePath, "utf-8");
			const lines = content.trim().split("\n");

			for (let i = lines.length - 1; i >= 0; i--) {
				try {
					const entry = JSON.parse(lines[i]);
					if (entry?.type !== "message") continue;

					const fromEntry = this.parseEntryTimestampMs(entry.timestamp);
					if (fromEntry !== undefined) return fromEntry;

					const fromMessage = this.parseEntryTimestampMs(entry.message?.timestamp);
					if (fromMessage !== undefined) return fromMessage;
				} catch {}
			}

			return undefined;
		} catch {
			return undefined;
		}
	}

	private getSessionLatestMessageTimestamp(sessionPath: string): number | undefined {
		const jsonlFiles = this.getSessionJsonlFiles(sessionPath);
		for (const file of jsonlFiles) {
			const timestamp = this.getLatestMessageTimestampFromJsonl(file.path);
			if (timestamp !== undefined) return timestamp;
		}
		return undefined;
	}

	private getSessionLatestJsonlMtime(sessionPath: string): number | undefined {
		return this.getSessionJsonlFiles(sessionPath)[0]?.mtime;
	}

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
						// biome-ignore lint/suspicious/noExplicitAny: Parsing opaque JSONL session data
						const textContent = entry.message.content
							?.filter((c: any) => c.type === "text")
							// biome-ignore lint/suspicious/noExplicitAny: Parsing opaque JSONL session data
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

	private async listAllSessions(): Promise<
		Array<{ sessionId: string; title?: string; messageCount: number; createdAt?: number; updatedAt?: number }>
	> {
		const sessions: Array<{ sessionId: string; title?: string; messageCount: number; createdAt?: number; updatedAt?: number }> =
			[];
		const sessionsDir = join(getAppDir(), "sessions");

		if (!existsSync(sessionsDir)) {
			return sessions;
		}

		try {
			// Get all web_* session directories
			const dirs = readdirSync(sessionsDir);
			const webSessions = dirs
				.filter((dir) => dir.startsWith("web_"))
				.map((dir) => {
					const path = join(sessionsDir, dir);
					try {
						const stats = statSync(path);
						if (!stats.isDirectory()) return null;

						const latestMessageTimestamp = this.getSessionLatestMessageTimestamp(path);
						const latestJsonlMtime = this.getSessionLatestJsonlMtime(path);
						return {
							sessionId: dir,
							path,
							createdAt: stats.birthtime?.getTime(),
							updatedAt: latestMessageTimestamp ?? latestJsonlMtime ?? stats.mtime.getTime(),
						};
					} catch {
						return null;
					}
				})
				.filter((session): session is NonNullable<typeof session> => session !== null)
				// Sort by modification time, newest first
				.sort((a, b) => b.updatedAt - a.updatedAt);

			// For each session directory, check if it's in memory or read from disk
			for (const { sessionId, path, createdAt, updatedAt } of webSessions) {
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
							// biome-ignore lint/suspicious/noExplicitAny: Filtering message content union type
							const textContent = lastUserMessage.content
								.filter((c: any) => c.type === "text")
								// biome-ignore lint/suspicious/noExplicitAny: Filtering message content union type
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
						createdAt,
						updatedAt,
					});
				} else {
					// For sessions not in memory, read title from disk
					const title = this.getSessionTitleFromDisk(path);

					sessions.push({
						sessionId,
						title,
						messageCount: 0, // We don't count messages for sessions not in memory
						createdAt,
						updatedAt,
					});
				}
			}
		} catch (err) {
			console.error("[web] Failed to list sessions:", err);
		}

		return sessions;
	}

	private sendResponse(ws: WSContext, sessionId: string | undefined, response: RpcResponse): void {
		if (!sessionId) {
			// Special case for responses without session context
			ws.send(JSON.stringify(response));
			return;
		}

		const message: OutboundWebMessage = { sessionId, event: response };
		ws.send(JSON.stringify(message));
	}

	private sendError(
		ws: WSContext,
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

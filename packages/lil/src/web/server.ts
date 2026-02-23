import type { AgentSession, AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { AgentMessage, AgentState } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { getLilDir, type LilConfig } from "../config.ts";

const COOKIE_NAME = "lil_web_token";
const WEB_CHAT_IDENTIFIER = "web_default";
const WEB_DIST_DIR = join(import.meta.dir, "../../../web/dist");

interface UploadedFile {
  id: string;
  owner: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: number;
}

interface WsClientData {
  owner: string;
  sessionName: string;
  sessionKey: string;
  unsubscribe?: () => void;
  chain: Promise<void>;
}

interface WebServerDeps {
  getSession: (sessionKey: string, config: LilConfig) => Promise<AgentSession>;
  resetSession: (sessionKey: string) => Promise<void> | void;
  listSessionNames: (chatIdentifier: string) => string[];
}

interface WebServerHandle {
  stop: () => void;
}

const uploads = new Map<string, UploadedFile>();

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const key = part.substring(0, i).trim();
    const value = part.substring(i + 1).trim();
    if (!key) continue;
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function getAuthToken(req: Request): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.substring(7).trim();
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  const cookies = parseCookies(req.headers.get("cookie"));
  return cookies[COOKIE_NAME];
}

function isAuthorized(req: Request, expectedToken: string): boolean {
  const token = getAuthToken(req);
  return token === expectedToken;
}

function sanitizeSessionName(name: string | undefined): string {
  if (!name) return "default";
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned || "default";
}

function buildSessionKey(owner: string, sessionName: string): string {
  return `${owner}_${sanitizeSessionName(sessionName)}`;
}

function safeWebFilePath(pathname: string): string | null {
  let path = pathname;
  if (path === "/") path = "/index.html";
  const normalized = normalize(path).replace(/^\/+/, "");
  const absolute = join(WEB_DIST_DIR, normalized);
  if (!absolute.startsWith(WEB_DIST_DIR)) return null;
  return absolute;
}

function serializeState(state: AgentState): Record<string, unknown> {
  const model = state.model
    ? {
        provider: state.model.provider,
        id: state.model.id,
        name: (state.model as any).name ?? state.model.id,
      }
    : null;

  return {
    systemPrompt: state.systemPrompt,
    model,
    thinkingLevel: state.thinkingLevel,
    tools: (state.tools ?? []).map((t) => ({
      name: (t as any).name,
      description: (t as any).description,
      label: (t as any).label,
      parameters: (t as any).parameters,
    })),
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamMessage: state.streamMessage,
    pendingToolCalls: Array.from(state.pendingToolCalls ?? []),
    error: state.error,
  };
}

function parseWsText(message: string | Buffer | ArrayBuffer | Buffer[]): string {
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return Buffer.concat(message).toString("utf-8");
  if (message instanceof ArrayBuffer) return Buffer.from(message).toString("utf-8");
  return Buffer.from(message).toString("utf-8");
}

function wsSend(ws: Bun.ServerWebSocket<WsClientData>, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify(payload));
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

async function attachSession(
  ws: Bun.ServerWebSocket<WsClientData>,
  data: WsClientData,
  config: LilConfig,
  deps: WebServerDeps,
): Promise<void> {
  data.unsubscribe?.();

  const session = await deps.getSession(data.sessionKey, config);
  data.unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    wsSend(ws, {
      type: "event",
      sessionName: data.sessionName,
      event,
      state: serializeState(session.state),
    });
  });

  wsSend(ws, {
    type: "state",
    sessionName: data.sessionName,
    state: serializeState(session.state),
  });
}

function uploadDirForOwner(owner: string): string {
  const dir = join(getLilDir(), "uploads", owner);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function safeFileName(fileName: string): string {
  const trimmed = fileName.trim() || "attachment";
  return trimmed.replace(/[\\/\x00-\x1f\x7f]+/g, "_").slice(0, 180);
}

async function buildPromptFromUploads(
  owner: string,
  text: string,
  uploadIds: string[] | undefined,
): Promise<{ promptText: string; images: ImageContent[] }> {
  if (!uploadIds || uploadIds.length === 0) {
    return { promptText: text, images: [] };
  }

  const images: ImageContent[] = [];
  const filePaths: { fileName: string; path: string }[] = [];

  for (const id of uploadIds) {
    const uploaded = uploads.get(id);
    if (!uploaded || uploaded.owner !== owner) {
      throw new Error(`Unknown upload id: ${id}`);
    }

    if (uploaded.mimeType.startsWith("image/")) {
      const buffer = readFileSync(uploaded.path);
      images.push({
        type: "image",
        data: buffer.toString("base64"),
        mimeType: uploaded.mimeType,
      });
    } else {
      filePaths.push({ fileName: uploaded.fileName, path: uploaded.path });
    }
  }

  let promptText = text;
  if (filePaths.length > 0) {
    const fileList = filePaths.map((f) => `  - ${f.fileName}: ${f.path}`).join("\n");
    const prefix = promptText ? `${promptText}\n\n` : "";
    promptText = `${prefix}[Attached files saved to disk]\n${fileList}`;
  }

  return { promptText, images };
}

async function handleUpload(req: Request, token: string): Promise<Response> {
  if (!isAuthorized(req, token)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let form: any;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const owner = WEB_CHAT_IDENTIFIER;
  const dir = uploadDirForOwner(owner);

  const uploadedFiles: Array<Record<string, unknown>> = [];
  const entries: IterableIterator<[string, any]> = form.entries();
  for (const [, value] of entries) {
    const isFileLike =
      value &&
      typeof value === "object" &&
      typeof value.arrayBuffer === "function" &&
      typeof value.name === "string";

    if (!isFileLike) continue;

    const id = randomUUID();
    const fileName = safeFileName(value.name || `attachment-${id}`);
    const filePath = join(dir, `${id}-${fileName}`);
    const bytes = Buffer.from(await value.arrayBuffer());

    writeFileSync(filePath, bytes);

    const uploaded: UploadedFile = {
      id,
      owner,
      fileName,
      mimeType: value.type || "application/octet-stream",
      size: bytes.length,
      path: filePath,
      createdAt: Date.now(),
    };
    uploads.set(id, uploaded);

    uploadedFiles.push({
      id,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    });
  }

  if (uploadedFiles.length === 0) {
    return json({ error: "No file uploaded (expected multipart field with File)" }, { status: 400 });
  }

  return json({ files: uploadedFiles });
}

function notBuiltResponse(token: string): Response {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>lil web UI</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
      pre { background: #f6f8fa; padding: 1rem; border-radius: 8px; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <h1>lil web UI not built</h1>
    <p>Build the web app first:</p>
    <pre><code>cd web
bun install
bun run build</code></pre>
    <p>Then refresh this page.</p>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "set-cookie": `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`,
    },
  });
}

function serveStatic(req: Request, token: string): Response {
  if (!existsSync(WEB_DIST_DIR)) {
    return notBuiltResponse(token);
  }

  const url = new URL(req.url);
  const filePath = safeWebFilePath(url.pathname);
  if (!filePath) {
    return new Response("Forbidden", { status: 403 });
  }

  let target = filePath;
  if (!existsSync(target)) {
    // SPA fallback
    target = join(WEB_DIST_DIR, "index.html");
    if (!existsSync(target)) return notBuiltResponse(token);
  }

  const stat = statSync(target);
  if (!stat.isFile()) {
    return new Response("Not Found", { status: 404 });
  }

  const ext = extname(target).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  const headers: Record<string, string> = { "content-type": contentType };
  if (url.pathname === "/" || url.pathname === "/index.html") {
    headers["set-cookie"] = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`;
  }

  return new Response(Bun.file(target), { headers });
}

export async function startWebServer(config: LilConfig, deps: WebServerDeps): Promise<WebServerHandle> {
  const host = config.web?.host ?? "127.0.0.1";
  const port = config.web?.port ?? 3333;
  const token = config.web?.token;

  if (!token) {
    throw new Error("Web token is not configured");
  }

  const server = Bun.serve<WsClientData>({
    hostname: host,
    port,

    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        if (!isAuthorized(req, token)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const sessionName = sanitizeSessionName(url.searchParams.get("session") ?? "default");
        const data: WsClientData = {
          owner: WEB_CHAT_IDENTIFIER,
          sessionName,
          sessionKey: buildSessionKey(WEB_CHAT_IDENTIFIER, sessionName),
          chain: Promise.resolve(),
        };

        if (!server.upgrade(req, { data })) {
          return new Response("Failed to upgrade", { status: 500 });
        }
        return new Response(null);
      }

      if (url.pathname === "/api/upload") {
        return handleUpload(req, token);
      }

      if (url.pathname === "/api/health") {
        return json({ ok: true });
      }

      return serveStatic(req, token);
    },

    websocket: {
      async open(ws) {
        const data = ws.data;
        try {
          await attachSession(ws, data, config, deps);
          wsSend(ws, {
            type: "ready",
            sessionName: data.sessionName,
            sessions: deps.listSessionNames(data.owner),
          });
        } catch (err) {
          wsSend(ws, {
            type: "response",
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      message(ws, raw) {
        const data = ws.data;

        data.chain = data.chain
          .then(async () => {
            const text = parseWsText(raw);
            const msg = JSON.parse(text) as Record<string, unknown>;
            const type = typeof msg.type === "string" ? msg.type : "";
            const requestId = typeof msg.requestId === "string" ? msg.requestId : undefined;

            const reply = (ok: boolean, extra?: Record<string, unknown>) => {
              wsSend(ws, {
                type: "response",
                requestId,
                ok,
                ...(extra ?? {}),
              });
            };

            if (!type) {
              reply(false, { error: "Missing message type" });
              return;
            }

            const session = await deps.getSession(data.sessionKey, config);

            switch (type) {
              case "prompt": {
                const text = typeof msg.text === "string" ? msg.text : "";
                const uploadIds = Array.isArray(msg.uploadIds)
                  ? msg.uploadIds.filter((v): v is string => typeof v === "string")
                  : [];

                const { promptText, images } = await buildPromptFromUploads(data.owner, text, uploadIds);
                if (!promptText.trim() && images.length === 0) {
                  reply(false, { error: "Empty prompt" });
                  return;
                }

                await session.prompt(promptText || "Describe this image.", {
                  source: "rpc",
                  images: images.length > 0 ? images : undefined,
                });
                reply(true);
                return;
              }

              case "abort": {
                await session.abort();
                reply(true);
                return;
              }

              case "session.list": {
                reply(true, { sessions: deps.listSessionNames(data.owner) });
                return;
              }

              case "session.switch": {
                const requested = sanitizeSessionName(
                  typeof msg.name === "string" ? msg.name : data.sessionName,
                );
                data.sessionName = requested;
                data.sessionKey = buildSessionKey(data.owner, requested);
                await attachSession(ws, data, config, deps);
                reply(true, { sessionName: data.sessionName });
                return;
              }

              case "session.new": {
                const requested = sanitizeSessionName(typeof msg.name === "string" ? msg.name : undefined);
                data.sessionName = requested === "default" ? `session-${Date.now()}` : requested;
                data.sessionKey = buildSessionKey(data.owner, data.sessionName);
                await attachSession(ws, data, config, deps);
                reply(true, { sessionName: data.sessionName });
                return;
              }

              case "session.clear": {
                await session.newSession();
                wsSend(ws, {
                  type: "state",
                  sessionName: data.sessionName,
                  state: serializeState(session.state),
                });
                reply(true);
                return;
              }

              case "session.reset": {
                await deps.resetSession(data.sessionKey);
                await attachSession(ws, data, config, deps);
                reply(true);
                return;
              }

              default:
                reply(false, { error: `Unknown message type: ${type}` });
            }
          })
          .catch((err) => {
            wsSend(ws, {
              type: "response",
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      },

      close(ws) {
        ws.data.unsubscribe?.();
      },
    },
  });

  console.log(`[web] Server listening on http://${host}:${port}`);

  return {
    stop: () => {
      try {
        server.stop(true);
      } catch {
        // ignore
      }
    },
  };
}

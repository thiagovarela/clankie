import { existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { Context } from "hono";
import { setCookieHeader } from "./middleware/auth.ts";

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

function safeWebFilePath(pathname: string, webDistDir: string): string | null {
	let path = pathname;
	if (path === "/") path = "/index.html";
	const normalized = normalize(path).replace(/^\/+/, "");
	const absolute = join(webDistDir, normalized);
	if (!absolute.startsWith(webDistDir)) return null;
	return absolute;
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
    <pre><code>bun run web:build</code></pre>
    <p>Then refresh this page.</p>
  </body>
</html>`;

	return new Response(html, {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"set-cookie": setCookieHeader(token),
		},
	});
}

export function serveStatic(c: Context, webDistDir: string, token: string): Response {
	if (!existsSync(webDistDir)) {
		return notBuiltResponse(token);
	}

	const url = new URL(c.req.url);
	const filePath = safeWebFilePath(url.pathname, webDistDir);
	if (!filePath) {
		return c.text("Forbidden", 403);
	}

	let target = filePath;
	if (!existsSync(target)) {
		// SPA fallback
		target = join(webDistDir, "index.html");
		if (!existsSync(target)) return notBuiltResponse(token);
	}

	const stat = statSync(target);
	if (!stat.isFile()) {
		return c.text("Not Found", 404);
	}

	const ext = extname(target).toLowerCase();
	const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

	const headers: Record<string, string> = { "content-type": contentType };
	if (url.pathname === "/" || url.pathname === "/index.html") {
		headers["set-cookie"] = setCookieHeader(token);
	}

	return new Response(Bun.file(target), { headers });
}

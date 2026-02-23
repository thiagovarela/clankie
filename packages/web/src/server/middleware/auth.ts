import type { Context, MiddlewareHandler } from "hono";

const COOKIE_NAME = "lil_web_token";

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

export function getAuthToken(c: Context): string | undefined {
	// 1. Authorization header (Bearer token)
	const auth = c.req.header("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) {
		return auth.substring(7).trim();
	}

	// 2. Query parameter
	const url = new URL(c.req.url);
	const queryToken = url.searchParams.get("token");
	if (queryToken) return queryToken;

	// 3. Cookie
	const cookies = parseCookies(c.req.header("cookie"));
	return cookies[COOKIE_NAME];
}

export function authMiddleware(expectedToken: string): MiddlewareHandler {
	return async (c, next) => {
		const token = getAuthToken(c);
		if (token !== expectedToken) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		await next();
	};
}

export function setCookieHeader(token: string): string {
	return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`;
}

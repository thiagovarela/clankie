import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { createWebApp, createWebSocketHandler, type WebServerDeps } from "lil-web/server";
import type { LilConfig } from "../config.ts";
import { getLilDir } from "../config.ts";

interface WebServerHandle {
	stop: () => void;
}

interface InternalWebServerDeps {
	getSession: (sessionKey: string, config: LilConfig, personaName?: string) => Promise<AgentSession>;
	resetSession: (sessionKey: string) => Promise<void> | void;
	listSessionNames: (chatIdentifier: string) => string[];
}

export async function startWebServer(config: LilConfig, deps: InternalWebServerDeps): Promise<WebServerHandle> {
	const host = config.web?.host ?? "127.0.0.1";
	const port = config.web?.port ?? 3333;
	const token = config.web?.token;

	if (!token) {
		throw new Error("Web token is not configured");
	}

	const lilDir = getLilDir();

	// Create Hono app with injected dependencies
	const webDeps: WebServerDeps = {
		token,
		config,
		getSession: deps.getSession,
		resetSession: deps.resetSession,
		listSessionNames: deps.listSessionNames,
	};

	const app = createWebApp(webDeps, lilDir);
	const wsHandler = createWebSocketHandler(webDeps);

	const server = Bun.serve({
		hostname: host,
		port,
		fetch: (req, server) => app.fetch(req, { server }),
		websocket: wsHandler,
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

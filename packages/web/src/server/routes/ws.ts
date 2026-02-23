import { readFileSync } from "node:fs";
import type { Context } from "hono";
import type { AgentSession, WebServerDeps, WsClientData } from "../types.ts";
import { uploads } from "./api.ts";

const WEB_CHAT_IDENTIFIER = "web_default";
const IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function sanitizeSessionName(name: string | undefined): string {
	if (!name) return "default";
	const cleaned = name
		.trim()
		.replace(/[^a-zA-Z0-9._-]/g, "-")
		.replace(/-+/g, "-");
	return cleaned || "default";
}

function buildSessionKey(owner: string, sessionName: string): string {
	return `${owner}_${sanitizeSessionName(sessionName)}`;
}

function serializeState(state: AgentSession["state"]): Record<string, unknown> {
	const model = state.model
		? {
				provider: state.model.provider,
				id: state.model.id,
				name: state.model.name ?? state.model.id,
			}
		: null;

	return {
		systemPrompt: state.systemPrompt,
		model,
		thinkingLevel: state.thinkingLevel,
		tools: (state.tools ?? []).map((t) => ({
			name: t.name,
			description: t.description,
			label: t.label,
			parameters: t.parameters,
		})),
		messages: state.messages,
		isStreaming: state.isStreaming,
		streamMessage: state.streamMessage,
		pendingToolCalls: Array.from(state.pendingToolCalls ?? []),
		error: state.error,
	};
}

function parseWsText(message: string | ArrayBuffer | Buffer): string {
	if (typeof message === "string") return message;
	if (message instanceof ArrayBuffer) return Buffer.from(message).toString("utf-8");
	return Buffer.from(message).toString("utf-8");
}

async function buildPromptFromUploads(
	owner: string,
	text: string,
	uploadIds: string[] | undefined,
): Promise<{ promptText: string; images: Array<{ type: "image"; data: string; mimeType: string }> }> {
	if (!uploadIds || uploadIds.length === 0) {
		return { promptText: text, images: [] };
	}

	const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
	const filePaths: { fileName: string; path: string }[] = [];

	for (const id of uploadIds) {
		const uploaded = uploads.get(id);
		if (!uploaded || uploaded.owner !== owner) {
			throw new Error(`Unknown upload id: ${id}`);
		}

		if (IMAGE_MIME_PREFIXES.some((prefix) => uploaded.mimeType.startsWith(prefix))) {
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

async function attachSession(ws: any, data: WsClientData, config: WebServerDeps["config"], deps: WebServerDeps) {
	data.unsubscribe?.();

	const personaName = config.web?.persona ?? config.agent?.persona ?? "default";
	const session = await deps.getSession(data.sessionKey, config, personaName);

	data.unsubscribe = session.subscribe((event) => {
		ws.send(
			JSON.stringify({
				type: "event",
				sessionName: data.sessionName,
				event,
				state: serializeState(session.state),
			}),
		);
	});

	ws.send(
		JSON.stringify({
			type: "state",
			sessionName: data.sessionName,
			state: serializeState(session.state),
		}),
	);
}

export function createWebSocketHandler(deps: WebServerDeps) {
	return {
		async open(ws: any) {
			const data = ws.data as WsClientData;
			try {
				await attachSession(ws, data, deps.config, deps);
				ws.send(
					JSON.stringify({
						type: "ready",
						sessionName: data.sessionName,
						sessions: deps.listSessionNames(data.owner),
					}),
				);
			} catch (err) {
				ws.send(
					JSON.stringify({
						type: "response",
						ok: false,
						error: err instanceof Error ? err.message : String(err),
					}),
				);
			}
		},

		message(ws: any, raw: string | ArrayBuffer | Buffer) {
			const data = ws.data as WsClientData;

			data.chain = data.chain
				.then(async () => {
					const text = parseWsText(raw);
					const msg = JSON.parse(text) as Record<string, unknown>;
					const type = typeof msg.type === "string" ? msg.type : "";
					const requestId = typeof msg.requestId === "string" ? msg.requestId : undefined;

					const reply = (ok: boolean, extra?: Record<string, unknown>) => {
						ws.send(
							JSON.stringify({
								type: "response",
								requestId,
								ok,
								...(extra ?? {}),
							}),
						);
					};

					if (!type) {
						reply(false, { error: "Missing message type" });
						return;
					}

					const personaName = deps.config.web?.persona ?? deps.config.agent?.persona ?? "default";
					const session = await deps.getSession(data.sessionKey, deps.config, personaName);

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
							const requested = sanitizeSessionName(typeof msg.name === "string" ? msg.name : data.sessionName);
							data.sessionName = requested;
							data.sessionKey = buildSessionKey(data.owner, requested);
							await attachSession(ws, data, deps.config, deps);
							reply(true, { sessionName: data.sessionName });
							return;
						}

						case "session.new": {
							const requested = sanitizeSessionName(typeof msg.name === "string" ? msg.name : undefined);
							data.sessionName = requested === "default" ? `session-${Date.now()}` : requested;
							data.sessionKey = buildSessionKey(data.owner, data.sessionName);
							await attachSession(ws, data, deps.config, deps);
							reply(true, { sessionName: data.sessionName });
							return;
						}

						case "session.clear": {
							await session.newSession();
							ws.send(
								JSON.stringify({
									type: "state",
									sessionName: data.sessionName,
									state: serializeState(session.state),
								}),
							);
							reply(true);
							return;
						}

						case "session.reset": {
							await deps.resetSession(data.sessionKey);
							await attachSession(ws, data, deps.config, deps);
							reply(true);
							return;
						}

						default:
							reply(false, { error: `Unknown message type: ${type}` });
					}
				})
				.catch((err) => {
					ws.send(
						JSON.stringify({
							type: "response",
							ok: false,
							error: err instanceof Error ? err.message : String(err),
						}),
					);
				});
		},

		close(ws: any) {
			const data = ws.data as WsClientData;
			data.unsubscribe?.();
		},
	};
}

export function upgradeWebSocket(c: Context, _deps: WebServerDeps): Response | undefined {
	const url = new URL(c.req.url);
	const sessionName = sanitizeSessionName(url.searchParams.get("session") ?? "default");
	const owner = WEB_CHAT_IDENTIFIER;

	const data: WsClientData = {
		owner,
		sessionName,
		sessionKey: buildSessionKey(owner, sessionName),
		chain: Promise.resolve(),
	};

	const success = (c.env?.server as any)?.upgrade(c.req.raw, { data });
	return success ? undefined : c.text("Failed to upgrade", 500);
}

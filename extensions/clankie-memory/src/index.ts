import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createEmbeddingProvider } from "./embeddings.ts";
import { MemoryIndexer } from "./indexer.ts";
import { hybridSearch } from "./search.ts";
import { MemoryStore } from "./store.ts";
import { ensureParentDir, type MemoryConfig, resolveMemoryConfig, resolveMemoryFilePath } from "./types.ts";

interface RuntimeState {
	cwd: string;
	config: MemoryConfig;
	store: MemoryStore;
	indexer: MemoryIndexer;
	embeddingProvider: ReturnType<typeof createEmbeddingProvider>;
}

let sharedState: RuntimeState | null = null;
let activeSessions = 0;

function ensureRuntime(cwd: string): RuntimeState {
	if (sharedState && sharedState.cwd === cwd) {
		return sharedState;
	}

	const config = resolveMemoryConfig(cwd);
	const store = new MemoryStore(config.dbPath);
	const embeddingProvider = createEmbeddingProvider(config);
	const indexer = new MemoryIndexer(store, embeddingProvider, config);

	sharedState = {
		cwd,
		config,
		store,
		indexer,
		embeddingProvider,
	};
	return sharedState;
}

function readDailyContext(cwd: string, daysAgo: number): string | null {
	const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const path = join(cwd, "memory", `${y}-${m}-${d}.md`);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf8").trim();
}

async function handleSearch(runtime: RuntimeState, query: string, maxResults?: number) {
	const results = await hybridSearch(runtime.store, runtime.embeddingProvider, runtime.config, query, maxResults);
	return results.map((item) => ({
		snippet: item.snippet,
		filePath: item.filePath,
		lineRange: `${item.lineStart}-${item.lineEnd}`,
		score: Number(item.score.toFixed(4)),
	}));
}

function handleWrite(runtime: RuntimeState, content: string, type: "daily" | "longterm") {
	const target = resolveMemoryFilePath(runtime.cwd, type);
	mkdirSync(ensureParentDir(target), { recursive: true });
	const timestamp = new Date().toISOString();
	appendFileSync(target, `\n- ${timestamp} ${content.trim()}\n`, "utf8");
	return target;
}

export default function memoryExtension(pi: ExtensionAPI) {
	let cwd = process.cwd();

	pi.on("session_start", async (_event, ctx) => {
		cwd = ctx.cwd;
		const runtime = ensureRuntime(cwd);
		if (!runtime.config.enabled) return;

		activeSessions += 1;
		runtime.store.open();
		await runtime.indexer.syncAll(cwd);
		runtime.indexer.watchMemoryFiles(cwd, () => {
			ctx.ui.setStatus("memory", "🧠 memory synced");
		});
		ctx.ui.setStatus("memory", "🧠 memory ready");
	});

	pi.on("session_shutdown", () => {
		activeSessions = Math.max(0, activeSessions - 1);
		if (!sharedState) return;
		if (activeSessions === 0) {
			sharedState.indexer.stopWatching();
			sharedState.store.close();
			sharedState = null;
		}
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		const runtime = ensureRuntime(ctx.cwd);
		if (!runtime.config.enabled) return {};

		const today = readDailyContext(ctx.cwd, 0);
		const yesterday = readDailyContext(ctx.cwd, 1);
		const blocks = [
			today ? `Today notes:\n${today}` : null,
			yesterday ? `Yesterday notes:\n${yesterday}` : null,
		].filter(Boolean);
		if (blocks.length === 0) return {};
		return {
			systemPrompt: `\n\nPersistent memory context:\n${blocks.join("\n\n")}`,
		};
	});

	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description: "Search persistent memory using hybrid text + vector retrieval",
		parameters: Type.Object({
			query: Type.String({ minLength: 1 }),
			maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
		}),
		async execute(_toolCallId, rawParams, _signal, _onUpdate, _ctx) {
			const params = rawParams as { query: string; maxResults?: number };
			const runtime = ensureRuntime(cwd);
			if (!runtime.config.enabled) {
				return { content: [{ type: "text" as const, text: "Memory is disabled." }], details: {} };
			}
			const now = Date.now();
			const lastSync = runtime.store.getMeta("last_sync_at");
			if (!lastSync || now - Date.parse(lastSync) > 60_000) {
				await runtime.indexer.syncAll(runtime.cwd);
			}
			const rows = await handleSearch(runtime, params.query, params.maxResults);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "memory_write",
		label: "Memory Write",
		description: "Persist a memory note into long-term or daily memory files",
		parameters: Type.Object({
			content: Type.String({ minLength: 1 }),
			type: Type.Optional(Type.Union([Type.Literal("daily"), Type.Literal("longterm")])),
		}),
		async execute(_toolCallId, rawParams, _signal, _onUpdate, _ctx) {
			const params = rawParams as { content: string; type?: "daily" | "longterm" };
			const runtime = ensureRuntime(cwd);
			const type = params.type ?? "daily";
			const absoluteTarget = handleWrite(runtime, params.content, type);
			await runtime.indexer.syncFile(runtime.cwd, absoluteTarget);
			return {
				content: [
					{
						type: "text" as const,
						text: `Saved memory to ${absoluteTarget.replace(`${runtime.cwd}/`, "")}`,
					},
				],
				details: {},
			};
		},
	});

	pi.registerCommand("memory", {
		description: "Memory controls: /memory status | /memory reindex | /memory search <query>",
		handler: async (args, ctx) => {
			const runtime = ensureRuntime(cwd);
			const trimmed = args.trim();
			if (!trimmed || trimmed === "status") {
				const stats = runtime.store.getStats();
				ctx.ui.notify(
					[
						`Memory: ${runtime.config.enabled ? "enabled" : "disabled"}`,
						`DB: ${runtime.config.dbPath}`,
						`Provider: ${runtime.embeddingProvider.providerName}`,
						`Files: ${stats.files}`,
						`Chunks: ${stats.chunks}`,
						`Last sync: ${stats.lastSync ?? "never"}`,
					].join("\n"),
					"info",
				);
				return;
			}

			if (trimmed === "reindex") {
				await runtime.indexer.syncAll(runtime.cwd);
				ctx.ui.notify("✓ Memory reindexed", "info");
				return;
			}

			if (trimmed.startsWith("search ")) {
				const query = trimmed.slice("search ".length).trim();
				if (!query) {
					ctx.ui.notify("Usage: /memory search <query>", "warning");
					return;
				}
				const results = await handleSearch(runtime, query);
				ctx.ui.notify(JSON.stringify(results, null, 2), "info");
				return;
			}

			ctx.ui.notify("Usage: /memory status | /memory reindex | /memory search <query>", "warning");
		},
	});
}

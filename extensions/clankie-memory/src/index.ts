/**
 * clankie-memory extension entry point
 * Provides persistent memory with SQLite FTS5 + vector hybrid search
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { clearEmbeddingCache, createEmbeddingProvider, type EmbeddingProvider } from "./embeddings.ts";
import { Indexer } from "./indexer.ts";
import { MemoryStore } from "./store.ts";
import { type MemoryConfig, resolveConfig } from "./types.ts";

// Extension state
interface MemoryState {
	config: MemoryConfig;
	store: MemoryStore;
	indexer: Indexer;
	embeddingProvider: EmbeddingProvider;
	workspaceDir: string;
	isReady: boolean;
}

let state: MemoryState | null = null;

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
	return new Date().toISOString().split("T")[0];
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
function getYesterdayDate(): string {
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	return yesterday.toISOString().split("T")[0];
}

/**
 * Read file content if exists
 */
function readFileIfExists(filePath: string): string | null {
	try {
		return readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Initialize the memory extension
 */
async function initializeMemory(pi: ExtensionAPI, cwd: string): Promise<void> {
	// Resolve configuration
	const settings = pi.getFlag("memory-config") as Partial<MemoryConfig> | undefined;
	const config = resolveConfig(settings);

	if (!config.enabled) {
		console.log("[memory] Extension disabled in config");
		return;
	}

	// Ensure memory directory exists
	const memoryDir = join(cwd, "memory");
	if (!existsSync(memoryDir)) {
		mkdirSync(memoryDir, { recursive: true });
	}

	// Ensure MEMORY.md exists
	const memoryFile = join(cwd, "MEMORY.md");
	if (!existsSync(memoryFile)) {
		writeFileSync(memoryFile, "# Memory\n\nThis file contains long-term memory for Clankie.\n");
	}

	// Initialize TursoDB store
	const store = new MemoryStore(config);
	await store.open();

	// Detect embedding provider/dimension changes and force reindex when needed
	const currentEmbeddingProvider = config.embedding.provider ?? "none";
	const currentEmbeddingDimensions = String(config.embedding.dimensions);
	const storedEmbeddingProvider = await store.getMeta("embedding_provider");
	const storedEmbeddingDimensions = await store.getMeta("embedding_dimensions");

	if (
		storedEmbeddingProvider !== currentEmbeddingProvider ||
		storedEmbeddingDimensions !== currentEmbeddingDimensions
	) {
		console.log("[memory] Embedding configuration changed, forcing full reindex");
		await store.clearAllFileHashes();
		await store.setMeta("embedding_provider", currentEmbeddingProvider);
		await store.setMeta("embedding_dimensions", currentEmbeddingDimensions);
	}

	// Initialize embedding provider
	const embeddingProvider = createEmbeddingProvider(config.embedding, () => undefined);

	// Initialize indexer
	const indexer = new Indexer(config, store, embeddingProvider);

	// Store state (search is now built into MemoryStore)
	state = {
		config,
		store,
		indexer,
		embeddingProvider,
		workspaceDir: cwd,
		isReady: false,
	};

	// Start file watching
	indexer.watchMemoryFiles(cwd, (filePath) => {
		console.log(`[memory] File changed: ${filePath}`);
	});

	// Initial sync
	await indexer.syncAll(cwd);
	state.isReady = true;

	console.log("[memory] Extension loaded and ready");
}

/**
 * Shutdown the memory extension
 */
async function shutdownMemory(): Promise<void> {
	if (state) {
		state.indexer.stopWatching();
		await state.store.close();
		clearEmbeddingCache();
		state = null;
		console.log("[memory] Extension unloaded");
	}
}

/**
 * Main extension factory - uses ExtensionAPI pattern
 */
export default function memoryExtension(pi: ExtensionAPI) {
	let cwd = "";

	// Register session_start handler to initialize (has cwd in context)
	pi.on("session_start", async (_event, ctx) => {
		cwd = ctx.cwd;
		await initializeMemory(pi, cwd);
	});

	// Register agent_end handler to cleanup
	pi.on("agent_end", async () => {
		shutdownMemory();
	});

	// Register memory_search tool
	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description:
			"Search the persistent memory store using semantic and full-text search. Use this before making assumptions about past context, user preferences, or previous decisions.",
		parameters: Type.Object({
			query: Type.String({
				description: "The search query - be specific and include relevant keywords",
			}),
			maxResults: Type.Optional(
				Type.Number({
					description: "Maximum number of results to return (default: 10)",
					default: 10,
				}),
			),
		}),
		async execute(_toolCallId, rawParams) {
			const args = rawParams as { query: string; maxResults?: number };

			if (!state?.isReady) {
				return {
					content: [{ type: "text" as const, text: "Memory extension not ready" }],
					details: {},
				};
			}

			try {
				// Trigger background sync if needed
				if (!state.indexer.isRunning) {
					state.indexer.syncAll(state.workspaceDir).catch((err) => {
						console.error("[memory] Background sync failed:", err);
					});
				}

				// Get embedding for query if provider is configured
				let queryEmbedding: number[] | null = null;
				try {
					const embeddings = await state.embeddingProvider.embed([args.query]);
					queryEmbedding = embeddings[0];
				} catch {
					// Embedding failed, will use text-only search
				}

				// Use TursoDB hybrid search
				const results = await state.store.hybridSearch(
					args.query,
					queryEmbedding,
					args.maxResults ?? 10,
					{
						textWeight: state.config.search.textWeight,
						vectorWeight: state.config.search.vectorWeight,
					},
				);

				// Mark retrieved memories
				const memoryIds = results.map((r) => r.memory.id);
				if (memoryIds.length > 0) {
					await state.store.markRetrieved(memoryIds);
				}

				const text = JSON.stringify(
					{
						success: true,
						results: results.map((r) => ({
							snippet: r.memory.content.substring(0, 500),
							filePath: r.memory.filePath,
							lineRange: [r.memory.lineStart, r.memory.lineEnd],
							score: r.score,
							vectorScore: r.vectorScore,
							textScore: r.textScore,
							category: r.memory.category,
							retrievalCount: r.memory.retrievalCount,
						})),
					},
					null,
					2,
				);

				return {
					content: [{ type: "text" as const, text }],
					details: {},
				};
			} catch (error) {
				console.error("[memory] Search failed:", error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					details: {},
				};
			}
		},
	});

	// Register memory_write tool
	pi.registerTool({
		name: "memory_write",
		label: "Memory Write",
		description:
			"Write to persistent memory. Use type='daily' for notes about today, type='longterm' for durable facts, preferences, and decisions that should persist across sessions.",
		parameters: Type.Object({
			content: Type.String({
				description: "The content to write to memory",
			}),
			type: Type.Optional(
				Type.Union([Type.Literal("daily"), Type.Literal("longterm")], {
					description: "Type of memory entry: 'daily' for today's notes, 'longterm' for durable facts",
					default: "daily",
				}),
			),
		}),
		async execute(_toolCallId, rawParams) {
			const args = rawParams as { content: string; type?: "daily" | "longterm" };

			if (!state?.isReady) {
				return {
					content: [{ type: "text" as const, text: "Memory extension not ready" }],
					details: {},
				};
			}

			try {
				const memoryType = args.type ?? "daily";
				let filePath: string;

				if (memoryType === "longterm") {
					filePath = join(state.workspaceDir, "MEMORY.md");
				} else {
					const today = getTodayDate();
					filePath = join(state.workspaceDir, "memory", `${today}.md`);
				}

				// Append content with timestamp
				const timestamp = new Date().toISOString();
				const entry = `\n## ${timestamp}\n\n${args.content}\n`;

				appendFileSync(filePath, entry);

				// Trigger sync for this file
				await state.indexer.syncFile(filePath);

				return {
					content: [
						{
							type: "text" as const,
							text: `Written to ${memoryType} memory: ${filePath}`,
						},
					],
					details: {},
				};
			} catch (error) {
				console.error("[memory] Write failed:", error);
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					details: {},
				};
			}
		},
	});

	// Register memory command with subcommands
	pi.registerCommand("memory", {
		description: "Memory management commands",
		handler: async (args, ctx) => {
			const [subcommand, ...rest] = args.split(" ");

			switch (subcommand) {
				case "status": {
					if (!state?.isReady) {
						ctx.ui.notify("Memory extension not ready", "error");
						return;
					}
					const stats = await state.store.getStats();
					const embeddingConfig = state.config.embedding;
					const categories = Object.entries(stats.categoryCounts)
						.map(([k, v]) => `${k}: ${v}`)
						.join(", ");
					const text = `Memory Status:
- Memories indexed: ${stats.memoryCount}
- Files tracked: ${stats.fileCount}
- Categories: ${categories || "none"}
- Database: ${state.config.dbPath}
- Embedding: ${embeddingConfig.provider ?? "none"}/${embeddingConfig.model} (${embeddingConfig.dimensions} dims)`;
					ctx.ui.notify(text, "info");
					break;
				}

				case "reindex":
				case "rebuild": {
					if (!state?.isReady) {
						ctx.ui.notify("Memory extension not ready", "error");
						return;
					}
					console.log("[memory] Starting forced reindex...");
					await state.store.clearAllFileHashes();
					await state.indexer.syncAll(state.workspaceDir);
					const stats = await state.store.getStats();
					ctx.ui.notify(`Reindex complete. Indexed ${stats.memoryCount} memories from ${stats.fileCount} files.`, "info");
					break;
				}

				case "search": {
					if (!state?.isReady) {
						ctx.ui.notify("Memory extension not ready", "error");
						return;
					}
					const query = rest.join(" ");
					if (!query) {
						ctx.ui.notify("Usage: /memory search <query>", "error");
						return;
					}
					// Get embedding for query
					let queryEmbedding: number[] | null = null;
					try {
						const embeddings = await state.embeddingProvider.embed([query]);
						queryEmbedding = embeddings[0];
					} catch {
						// Will use text-only search
					}
					const results = await state.store.hybridSearch(query, queryEmbedding, 5);
					const output = results
						.map(
							(r, i) =>
								`${i + 1}. [${r.score.toFixed(3)}] ${r.memory.filePath}:${r.memory.lineStart}-${r.memory.lineEnd}\n   ${r.memory.content.substring(0, 200)}...`,
						)
						.join("\n\n");
					ctx.ui.notify(output || "No results found", "info");
					break;
				}

				case "prune": {
					if (!state?.isReady) {
						ctx.ui.notify("Memory extension not ready", "error");
						return;
					}
					const days = parseInt(rest[0] || "30", 10);
					const pruned = await state.store.pruneUnused(days);
					ctx.ui.notify(`Pruned ${pruned} unused memories older than ${days} days`, "info");
					break;
				}

				default: {
					ctx.ui.notify("Usage: /memory [status|reindex|search <query>|prune <days>]", "error");
				}
			}
		},
	});

	// Register hooks for session lifecycle
	pi.on("session_start", async (_event, ctx) => {
		if (!state) return;

		// Refresh file watching in case cwd changed
		state.indexer.stopWatching();
		state.indexer.watchMemoryFiles(ctx.cwd);

		// Background sync
		state.indexer.syncAll(ctx.cwd).catch((err) => {
			console.error("[memory] Session start sync failed:", err);
		});
	});

	// Register before_agent_start to inject memory context
	pi.on("before_agent_start", async () => {
		if (!state?.isReady) return {};

		// Inject recent daily notes into system prompt
		const today = getTodayDate();
		const yesterday = getYesterdayDate();

		const todayFile = join(state.workspaceDir, "memory", `${today}.md`);
		const yesterdayFile = join(state.workspaceDir, "memory", `${yesterday}.md`);

		let memoryContext = "\n\n## Recent Memory\n\n";
		let hasContent = false;

		// Read yesterday's notes
		const yesterdayContent = await readFileIfExists(yesterdayFile);
		if (yesterdayContent) {
			memoryContext += `### Yesterday (${yesterday})\n${yesterdayContent.substring(0, 1000)}\n\n`;
			hasContent = true;
		}

		// Read today's notes
		const todayContent = await readFileIfExists(todayFile);
		if (todayContent) {
			memoryContext += `### Today (${today})\n${todayContent.substring(0, 1000)}\n\n`;
			hasContent = true;
		}

		if (hasContent) {
			return { systemPrompt: memoryContext };
		}
		return {};
	});

	// Cleanup on session shutdown
	pi.on("session_shutdown", async () => {
		if (state) {
			state.indexer.stopWatching();
		}
	});
}

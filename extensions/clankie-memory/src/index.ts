/**
 * clankie-memory extension entry point
 * Provides persistent memory with SQLite FTS5 + vector hybrid search
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { clearEmbeddingCache, createEmbeddingProvider } from "./embeddings.ts";
import { Indexer } from "./indexer.ts";
import { SearchEngine } from "./search.ts";
import { MemoryStore } from "./store.ts";
import { type MemoryConfig, resolveConfig } from "./types.ts";

// Extension state
interface MemoryState {
	config: MemoryConfig;
	store: MemoryStore;
	indexer: Indexer;
	searchEngine: SearchEngine;
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
 * Main extension factory
 */
export default function memoryExtension(_pi: ExtensionAPI) {
	return {
		name: "clankie-memory",
		version: "0.1.0",

		async onLoad(ctx: {
			cwd: string;
			settings: { get<T>(key: string, defaultValue?: T): T | undefined };
		}): Promise<void> {
			// Resolve configuration
			const userConfig = ctx.settings.get<Partial<MemoryConfig>>("clankie-memory");
			const config = resolveConfig(userConfig);

			if (!config.enabled) {
				console.log("[memory] Extension disabled in config");
				return;
			}

			// Ensure memory directory exists
			const memoryDir = join(ctx.cwd, "memory");
			if (!existsSync(memoryDir)) {
				mkdirSync(memoryDir, { recursive: true });
			}

			// Ensure MEMORY.md exists
			const memoryFile = join(ctx.cwd, "MEMORY.md");
			if (!existsSync(memoryFile)) {
				writeFileSync(memoryFile, "# Memory\n\nThis file contains long-term memory for Clankie.\n");
			}

			// Initialize database
			const store = new MemoryStore(config);
			await store.open();

			// Initialize embedding provider
			const embeddingProvider = createEmbeddingProvider(config.embedding, (provider) => {
				// Try to get API key from pi's model registry
				// @ts-expect-error - accessing internal API
				const modelRegistry = ctx.modelRegistry;
				if (modelRegistry) {
					const entry = modelRegistry.get(provider);
					return entry?.apiKey;
				}
				return undefined;
			});

			// Initialize indexer
			const indexer = new Indexer(config, store, embeddingProvider);

			// Initialize search engine
			const searchEngine = new SearchEngine(config, store, embeddingProvider);

			// Store state
			state = {
				config,
				store,
				indexer,
				searchEngine,
				workspaceDir: ctx.cwd,
				isReady: false,
			};

			// Start file watching
			indexer.watchMemoryFiles(ctx.cwd, (filePath) => {
				console.log(`[memory] File changed: ${filePath}`);
			});

			// Initial sync
			await indexer.syncAll(ctx.cwd);
			state.isReady = true;

			console.log("[memory] Extension loaded and ready");
		},

		async onUnload(): Promise<void> {
			if (state) {
				state.indexer.stopWatching();
				state.store.close();
				clearEmbeddingCache();
				state = null;
				console.log("[memory] Extension unloaded");
			}
		},

		tools: [
			{
				name: "memory_search",
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
				async execute(args: { query: string; maxResults?: number }) {
					if (!state?.isReady) {
						return {
							success: false,
							error: "Memory extension not ready",
						};
					}

					try {
						// Trigger background sync if needed
						if (!state.indexer.isRunning) {
							state.indexer.syncAll(state.workspaceDir).catch((err) => {
								console.error("[memory] Background sync failed:", err);
							});
						}

						const results = await state.searchEngine.search(args.query, args.maxResults);

						return {
							success: true,
							results: results.map((r) => ({
								snippet: r.chunk.content.substring(0, 500),
								filePath: r.chunk.filePath,
								lineRange: [r.chunk.lineStart, r.chunk.lineEnd],
								score: r.score,
								vectorScore: r.vectorScore,
								textScore: r.textScore,
							})),
						};
					} catch (error) {
						console.error("[memory] Search failed:", error);
						return {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				},
			},
			{
				name: "memory_write",
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
				async execute(args: { content: string; type?: "daily" | "longterm" }) {
					if (!state?.isReady) {
						return {
							success: false,
							error: "Memory extension not ready",
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
							success: true,
							filePath,
							message: `Written to ${memoryType} memory`,
						};
					} catch (error) {
						console.error("[memory] Write failed:", error);
						return {
							success: false,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				},
			},
		],

		commands: [
			{
				name: "memory",
				description: "Memory management commands",
				subcommands: {
					status: {
						description: "Show memory index status",
						async execute() {
							if (!state?.isReady) {
								return { output: "Memory extension not ready" };
							}

							const stats = state.store.getStats();
							return {
								output: `Memory Status:
- Chunks indexed: ${stats.chunkCount}
- Files tracked: ${stats.fileCount}
- File hashes stored: ${stats.trackedFileCount}
- Database: ${state.config.dbPath}
- Embedding provider: ${state.config.embedding.provider}/${state.config.embedding.model}`,
							};
						},
					},
					reindex: {
						description: "Force full reindex of all memory files",
						async execute() {
							if (!state?.isReady) {
								return { output: "Memory extension not ready" };
							}

							console.log("[memory] Starting forced reindex...");
							await state.indexer.syncAll(state.workspaceDir);
							const stats = state.store.getStats();

							return {
								output: `Reindex complete. Indexed ${stats.chunkCount} chunks from ${stats.fileCount} files.`,
							};
						},
					},
					search: {
						description: "Search memory (for debugging)",
						arguments: [
							{
								name: "query",
								description: "Search query",
								required: true,
							},
						],
						async execute(args: string[]) {
							if (!state?.isReady) {
								return { output: "Memory extension not ready" };
							}

							const query = args.join(" ");
							const results = await state.searchEngine.search(query, 5);

							const output = results
								.map(
									(r, i) =>
										`${i + 1}. [${r.score.toFixed(3)}] ${r.chunk.filePath}:${r.chunk.lineStart}-${r.chunk.lineEnd}\n   ${r.chunk.content.substring(0, 200)}...`,
								)
								.join("\n\n");

							return {
								output: output || "No results found",
							};
						},
					},
				},
			},
		],

		hooks: {
			async onSessionStart(ctx: { cwd: string }) {
				if (!state) return;

				// Refresh file watching in case cwd changed
				state.indexer.stopWatching();
				state.indexer.watchMemoryFiles(ctx.cwd);

				// Background sync
				state.indexer.syncAll(ctx.cwd).catch((err) => {
					console.error("[memory] Session start sync failed:", err);
				});
			},

			async beforeAgentStart(ctx: { systemPrompt: string[] }) {
				if (!state?.isReady) return;

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
					ctx.systemPrompt.push(memoryContext);
				}
			},

			async onSessionShutdown() {
				if (state) {
					state.indexer.stopWatching();
				}
			},
		},
	};
}

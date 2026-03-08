/**
 * Markdown indexer for clankie-memory
 * Handles file watching, chunking, and sync logic
 */

import { createHash } from "node:crypto";
import { type FSWatcher, readFileSync, watch } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import type { EmbeddingProvider } from "./embeddings.ts";
import type { MemoryStore } from "./store.ts";
import type { Memory, MemoryConfig } from "./types.ts";

// Rough token estimation (characters / 4)
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// Generate chunk ID
function generateChunkId(filePath: string, index: number): string {
	const hash = createHash("sha256").update(`${filePath}:${index}`).digest("hex").substring(0, 16);
	return hash;
}

// Generate file content hash
function generateFileHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

/**
 * Chunk a markdown document into Memory entries
 * Strategy: heading-aware splitting with target token size
 */
export function chunkDocument(content: string, filePath: string, config: MemoryConfig): Memory[] {
	const lines = content.split("\n");
	const memories: Memory[] = [];
	let currentChunk: string[] = [];
	let currentStartLine = 0;
	let chunkIndex = 0;

	function flushChunk(endLine: number): void {
		if (currentChunk.length === 0) return;

		const chunkContent = currentChunk.join("\n");
		const now = Date.now();

		memories.push({
			id: generateChunkId(filePath, chunkIndex++),
			content: chunkContent,
			filePath,
			lineStart: currentStartLine + 1, // 1-indexed
			lineEnd: endLine,
			category: "chunk",
			createdAt: now,
			updatedAt: now,
		});

		// Keep overlap for context
		const overlapLines = Math.min(currentChunk.length, Math.ceil(config.chunkOverlapTokens / 4));
		currentChunk = currentChunk.slice(-overlapLines);
		currentStartLine = endLine - overlapLines;
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const isHeading = line.startsWith("#");

		// Flush at headings if we have enough content
		if (isHeading && currentChunk.length > 0) {
			const currentTokens = estimateTokens(currentChunk.join("\n"));
			if (currentTokens >= config.chunkTargetTokens * 0.5) {
				flushChunk(i);
			}
		}

		currentChunk.push(line);

		// Flush if we've hit target size
		const currentTokens = estimateTokens(currentChunk.join("\n"));
		if (currentTokens >= config.chunkTargetTokens) {
			flushChunk(i + 1);
		}
	}

	// Flush remaining content
	if (currentChunk.length > 0) {
		flushChunk(lines.length);
	}

	return memories;
}

/**
 * Indexer manages file watching and syncing
 */
export class Indexer {
	private config: MemoryConfig;
	private store: MemoryStore;
	private embeddingProvider: EmbeddingProvider;
	private watchers: FSWatcher[] = [];
	private debounceTimers = new Map<string, NodeJS.Timeout>();
	private isSyncing = false;

	constructor(config: MemoryConfig, store: MemoryStore, embeddingProvider: EmbeddingProvider) {
		this.config = config;
		this.store = store;
		this.embeddingProvider = embeddingProvider;
	}

	/**
	 * Start watching memory files for changes
	 */
	watchMemoryFiles(workspaceDir: string, onChange?: (filePath: string) => void): void {
		const memoryDir = join(workspaceDir, "memory");
		const memoryFile = join(workspaceDir, "MEMORY.md");

		// Watch MEMORY.md
		try {
			const watcher = watch(memoryFile, (eventType) => {
				if (eventType === "change") {
					this.debouncedSync(memoryFile, onChange);
				}
			});
			this.watchers.push(watcher);
		} catch {
			// File might not exist yet
		}

		// Watch memory/ directory
		try {
			const watcher = watch(memoryDir, { recursive: true }, (_eventType, filename) => {
				if (filename?.endsWith(".md")) {
					const filePath = join(memoryDir, filename);
					this.debouncedSync(filePath, onChange);
				}
			});
			this.watchers.push(watcher);
		} catch {
			// Directory might not exist yet
		}
	}

	/**
	 * Stop all file watchers
	 */
	stopWatching(): void {
		for (const watcher of this.watchers) {
			watcher.close();
		}
		this.watchers = [];
		for (const [, timer] of this.debounceTimers) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}

	/**
	 * Debounced sync for file changes
	 */
	private debouncedSync(filePath: string, onChange?: (filePath: string) => void): void {
		const existing = this.debounceTimers.get(filePath);
		if (existing) {
			clearTimeout(existing);
		}

		const timer = setTimeout(() => {
			this.debounceTimers.delete(filePath);
			this.syncFile(filePath)
				.then(() => onChange?.(filePath))
				.catch((err) => console.error(`[memory] Sync error for ${filePath}:`, err));
		}, this.config.debounceMs);

		this.debounceTimers.set(filePath, timer);
	}

	/**
	 * Sync a single file
	 */
	async syncFile(filePath: string): Promise<void> {
		try {
			const content = readFileSync(filePath, "utf-8");
			const hash = generateFileHash(content);

			// Check if file has changed
			const existing = await this.store.getFileHash(filePath);
			if (existing?.hash === hash) {
				return; // No change
			}

			// Delete old memories for this file
			await this.store.deleteByFile(filePath);

			// Chunk the document into memories
			const memories = chunkDocument(content, filePath, this.config);

			// Generate embeddings for memories (best-effort)
			if (memories.length > 0) {
				const texts = memories.map((m) => m.content);
				try {
					const embeddings = await this.embeddingProvider.embed(texts);
					for (let i = 0; i < memories.length; i++) {
						memories[i].embedding = embeddings[i];
					}
				} catch (error) {
					console.warn(
						`[memory] Embedding generation failed for ${filePath}. Continuing with text-only indexing:`,
						error,
					);
				}

				// Store memories (with or without embeddings)
				await this.store.upsertMemories(memories);
			}

			// Update file hash
			await this.store.setFileHash(filePath, hash);

			console.log(`[memory] Indexed ${memories.length} memories from ${filePath}`);
		} catch (error) {
			console.error(`[memory] Failed to sync ${filePath}:`, error);
		}
	}

	/**
	 * Sync all memory files in workspace
	 */
	async syncAll(workspaceDir: string): Promise<void> {
		if (this.isSyncing) {
			console.log("[memory] Sync already in progress, skipping");
			return;
		}

		this.isSyncing = true;
		console.log("[memory] Starting full sync...");

		try {
			const files = await this.findMemoryFiles(workspaceDir);

			for (const filePath of files) {
				await this.syncFile(filePath);
			}

			console.log(`[memory] Full sync complete. Indexed ${files.length} files.`);
		} catch (error) {
			console.error("[memory] Full sync failed:", error);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Find all memory files in workspace
	 */
	private async findMemoryFiles(workspaceDir: string): Promise<string[]> {
		const files: string[] = [];

		// MEMORY.md in root
		const memoryFile = join(workspaceDir, "MEMORY.md");
		try {
			readFileSync(memoryFile);
			files.push(memoryFile);
		} catch {
			// File doesn't exist
		}

		// All .md files in memory/ directory
		try {
			const memoryDir = join(workspaceDir, "memory");
			const pattern = join(memoryDir, "**/*.md");
			const matches = await glob(pattern);
			files.push(...matches);
		} catch {
			// Directory might not exist
		}

		return files;
	}

	/**
	 * Check if sync is currently running
	 */
	get isRunning(): boolean {
		return this.isSyncing;
	}
}

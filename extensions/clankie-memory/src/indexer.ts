import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, watch } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { EmbeddingProvider } from "./embeddings.ts";
import type { MemoryStore } from "./store.ts";
import type { MemoryConfig } from "./types.ts";

interface ChunkDraft {
	id: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
	content: string;
}

function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function chunkText(
	markdown: string,
	targetTokens: number,
	overlapTokens: number,
): Array<{ text: string; lineStart: number; lineEnd: number }> {
	const lines = markdown.split(/\r?\n/);
	const sections: Array<{ startLine: number; text: string }> = [];
	let buffer: string[] = [];
	let sectionStart = 1;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if ((line.startsWith("## ") || line.startsWith("### ")) && buffer.length > 0) {
			sections.push({ startLine: sectionStart, text: buffer.join("\n") });
			buffer = [line];
			sectionStart = i + 1;
		} else {
			if (buffer.length === 0) sectionStart = i + 1;
			buffer.push(line);
		}
	}
	if (buffer.length > 0) {
		sections.push({ startLine: sectionStart, text: buffer.join("\n") });
	}

	const chunks: Array<{ text: string; lineStart: number; lineEnd: number }> = [];
	for (const section of sections) {
		const words = section.text.split(/\s+/).filter(Boolean);
		if (words.length <= targetTokens) {
			const lineCount = section.text.split(/\r?\n/).length;
			chunks.push({
				text: section.text.trim(),
				lineStart: section.startLine,
				lineEnd: section.startLine + lineCount - 1,
			});
			continue;
		}

		let cursor = 0;
		while (cursor < words.length) {
			const end = Math.min(words.length, cursor + targetTokens);
			const text = words.slice(cursor, end).join(" ").trim();
			if (text.length > 0) {
				chunks.push({
					text,
					lineStart: section.startLine,
					lineEnd: section.startLine + section.text.split(/\r?\n/).length - 1,
				});
			}
			if (end >= words.length) break;
			cursor = Math.max(cursor + 1, end - overlapTokens);
		}
	}

	return chunks.filter((chunk) => chunk.text.length > 0);
}

function listMemoryFiles(workspaceDir: string): string[] {
	const files: string[] = [];
	const longTermFile = join(workspaceDir, "MEMORY.md");
	if (existsSync(longTermFile)) files.push(longTermFile);

	const memoryDir = join(workspaceDir, "memory");
	if (existsSync(memoryDir)) {
		const stack = [memoryDir];
		while (stack.length > 0) {
			const dir = stack.pop();
			if (!dir) continue;
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const absolute = join(dir, entry.name);
				if (entry.isDirectory()) {
					stack.push(absolute);
				} else if (entry.isFile() && entry.name.endsWith(".md")) {
					files.push(absolute);
				}
			}
		}
	}

	return files.sort();
}

export class MemoryIndexer {
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private watchers: Array<ReturnType<typeof watch>> = [];

	constructor(
		private readonly store: MemoryStore,
		private readonly embeddingProvider: EmbeddingProvider,
		private readonly config: MemoryConfig,
	) {}

	async syncAll(workspaceDir: string): Promise<void> {
		const files = listMemoryFiles(workspaceDir);
		const seen = new Set<string>();

		for (const filePath of files) {
			await this.syncFile(workspaceDir, filePath);
			seen.add(relative(workspaceDir, filePath));
		}

		for (const indexedFile of this.store.listIndexedFiles()) {
			if (!seen.has(indexedFile)) {
				this.store.deleteByFile(indexedFile);
			}
		}

		this.store.setMeta("last_sync_at", new Date().toISOString());
	}

	async syncFile(workspaceDir: string, absolutePath: string): Promise<void> {
		const resolvedPath = resolve(absolutePath);
		if (!existsSync(resolvedPath)) {
			const rel = relative(workspaceDir, resolvedPath);
			this.store.deleteByFile(rel);
			this.store.setMeta(`filehash:${rel}`, "");
			return;
		}

		const relPath = relative(workspaceDir, resolvedPath);
		const content = readFileSync(resolvedPath, "utf8");
		const contentHash = hashContent(content);
		const previousHash = this.store.getMeta(`filehash:${relPath}`);
		if (previousHash === contentHash) {
			return;
		}

		const draftChunks = chunkText(content, this.config.chunkTargetTokens, this.config.chunkOverlapTokens);
		const vectors = await this.embeddingProvider.embed(draftChunks.map((chunk) => chunk.text));

		const records = draftChunks.map((chunk, index): ChunkDraft & { embedding?: number[] } => ({
			id: `${relPath}:${index}`,
			filePath: relPath,
			lineStart: chunk.lineStart,
			lineEnd: chunk.lineEnd,
			content: chunk.text,
			embedding: vectors[index],
		}));

		this.store.upsertChunks(relPath, records);
		this.store.setMeta(`filehash:${relPath}`, contentHash);
		this.store.setMeta("last_sync_at", new Date().toISOString());
	}

	watchMemoryFiles(workspaceDir: string, onChange?: () => void): void {
		this.stopWatching();

		const longTerm = join(workspaceDir, "MEMORY.md");
		const memoryDir = join(workspaceDir, "memory");
		if (!existsSync(memoryDir)) {
			mkdirSync(memoryDir, { recursive: true });
		}

		const schedule = () => {
			if (this.debounceTimer) clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(async () => {
				try {
					await this.syncAll(workspaceDir);
					onChange?.();
				} catch (error) {
					console.warn(`[clankie-memory] watch sync failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			}, this.config.debounceMs);
		};

		try {
			if (existsSync(longTerm)) {
				this.watchers.push(watch(longTerm, schedule));
			}
		} catch {
			// ignore watcher setup errors
		}

		try {
			this.watchers.push(watch(memoryDir, { recursive: true }, schedule));
		} catch {
			// recursive watch unsupported on some platforms
			this.watchers.push(watch(memoryDir, schedule));
		}
	}

	stopWatching(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		for (const watcher of this.watchers) {
			watcher.close();
		}
		this.watchers = [];
	}
}

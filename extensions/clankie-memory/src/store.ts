import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export interface ChunkRecord {
	id: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
	content: string;
	embedding?: number[];
}

export interface FtsSearchResult {
	id: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
	content: string;
	rank: number;
}

export interface VectorSearchResult {
	id: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
	content: string;
	score: number;
}

function toEmbeddingBuffer(vector: number[] | undefined): Buffer | null {
	if (!vector || vector.length === 0) return null;
	const arr = Float32Array.from(vector);
	return Buffer.from(arr.buffer);
}

function fromEmbeddingBuffer(buf: Buffer | null): Float32Array | null {
	if (!buf || buf.byteLength === 0) return null;
	const data = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
	return data;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class MemoryStore {
	private db: Database.Database | null = null;

	constructor(private readonly dbPath: string) {}

	open(): void {
		mkdirSync(dirname(this.dbPath), { recursive: true });
		this.db = new Database(this.dbPath);
		this.db.pragma("journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				file_path TEXT NOT NULL,
				line_start INTEGER NOT NULL,
				line_end INTEGER NOT NULL,
				content TEXT NOT NULL,
				embedding BLOB,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
				content,
				content=chunks,
				content_rowid=rowid
			);

			CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
				INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
			END;

			CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
				INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);
			END;

			CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
				INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);
				INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
			END;

			CREATE TABLE IF NOT EXISTS meta (
				key TEXT PRIMARY KEY,
				value TEXT
			);
		`);
	}

	close(): void {
		this.db?.close();
		this.db = null;
	}

	upsertChunks(filePath: string, chunks: ChunkRecord[]): void {
		if (!this.db) return;
		const now = new Date().toISOString();
		const deleteStmt = this.db.prepare("DELETE FROM chunks WHERE file_path = ?");
		const insertStmt = this.db.prepare(`
			INSERT INTO chunks(id, file_path, line_start, line_end, content, embedding, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);
		const tx = this.db.transaction(() => {
			deleteStmt.run(filePath);
			for (const chunk of chunks) {
				insertStmt.run(
					chunk.id,
					chunk.filePath,
					chunk.lineStart,
					chunk.lineEnd,
					chunk.content,
					toEmbeddingBuffer(chunk.embedding),
					now,
					now,
				);
			}
		});
		tx();
	}

	deleteByFile(filePath: string): void {
		if (!this.db) return;
		this.db.prepare("DELETE FROM chunks WHERE file_path = ?").run(filePath);
	}

	searchFTS(query: string, limit: number): FtsSearchResult[] {
		if (!this.db) return [];
		const stmt = this.db.prepare(`
			SELECT chunks.id as id, chunks.file_path as filePath, chunks.line_start as lineStart,
				chunks.line_end as lineEnd, chunks.content as content, bm25(chunks_fts) as rank
			FROM chunks_fts
			JOIN chunks ON chunks_fts.rowid = chunks.rowid
			WHERE chunks_fts MATCH ?
			ORDER BY rank
			LIMIT ?
		`);
		return stmt.all(query, limit) as FtsSearchResult[];
	}

	searchVector(queryEmbedding: number[], limit: number): VectorSearchResult[] {
		if (!this.db || queryEmbedding.length === 0) return [];
		const target = Float32Array.from(queryEmbedding);
		const rows = this.db
			.prepare(
				"SELECT id, file_path as filePath, line_start as lineStart, line_end as lineEnd, content, embedding FROM chunks WHERE embedding IS NOT NULL",
			)
			.all() as Array<{
			id: string;
			filePath: string;
			lineStart: number;
			lineEnd: number;
			content: string;
			embedding: Buffer;
		}>;

		const scored: VectorSearchResult[] = [];
		for (const row of rows) {
			const vector = fromEmbeddingBuffer(row.embedding);
			if (!vector || vector.length !== target.length) continue;
			const score = cosineSimilarity(target, vector);
			scored.push({
				id: row.id,
				filePath: row.filePath,
				lineStart: row.lineStart,
				lineEnd: row.lineEnd,
				content: row.content,
				score,
			});
		}
		return scored.sort((a, b) => b.score - a.score).slice(0, limit);
	}

	setMeta(key: string, value: string): void {
		if (!this.db) return;
		this.db
			.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
			.run(key, value);
	}

	getMeta(key: string): string | null {
		if (!this.db) return null;
		const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
		return row?.value ?? null;
	}

	listIndexedFiles(): string[] {
		if (!this.db) return [];
		const rows = this.db
			.prepare("SELECT DISTINCT file_path as filePath FROM chunks ORDER BY file_path")
			.all() as Array<{
			filePath: string;
		}>;
		return rows.map((row) => row.filePath);
	}

	getStats(): { chunks: number; files: number; lastSync: string | null } {
		if (!this.db) return { chunks: 0, files: 0, lastSync: null };
		const chunks = this.db.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number };
		const files = this.db.prepare("SELECT COUNT(DISTINCT file_path) as count FROM chunks").get() as { count: number };
		const lastSync = this.getMeta("last_sync_at");
		return { chunks: chunks.count, files: files.count, lastSync };
	}
}

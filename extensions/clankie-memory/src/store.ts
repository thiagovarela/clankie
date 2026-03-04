/**
 * SQLite database store for clankie-memory
 * Uses FTS5 for full-text search and BLOB storage for embeddings
 */

import type Database from "better-sqlite3";
import type { Chunk, FileHash, MemoryConfig } from "./types.ts";

// Dynamic import to handle ESM/CJS compatibility
let DatabaseConstructor: typeof Database;

export class MemoryStore {
	private db: Database.Database | null = null;
	private config: MemoryConfig;
	private statements: Map<string, Database.Statement> = new Map();

	constructor(config: MemoryConfig) {
		this.config = config;
	}

	/**
	 * Open the database and initialize schema
	 */
	async open(): Promise<void> {
		// Dynamic import better-sqlite3
		if (!DatabaseConstructor) {
			const mod = await import("better-sqlite3");
			DatabaseConstructor = mod.default;
		}

		this.db = new DatabaseConstructor(this.config.dbPath);
		this.db.pragma("journal_mode = WAL");

		this.initializeSchema();
		this.prepareStatements();
	}

	/**
	 * Close the database
	 */
	close(): void {
		if (this.db) {
			this.statements.clear();
			this.db.close();
			this.db = null;
		}
	}

	/**
	 * Initialize database schema
	 */
	private initializeSchema(): void {
		if (!this.db) return;

		// Main chunks table
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
		`);

		// Index on file_path for faster lookups
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
		`);

		// FTS5 virtual table for full-text search
		this.db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
				content,
				content=chunks,
				content_rowid=rowid
			);
		`);

		// Triggers to keep FTS index in sync
		this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
				INSERT INTO chunks_fts(rowid, content)
				VALUES (new.rowid, new.content);
			END;
		`);

		this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
				INSERT INTO chunks_fts(chunks_fts, rowid, content)
				VALUES ('delete', old.rowid, old.content);
			END;
		`);

		this.db.exec(`
			CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
				INSERT INTO chunks_fts(chunks_fts, rowid, content)
				VALUES ('delete', old.rowid, old.content);
				INSERT INTO chunks_fts(rowid, content)
				VALUES (new.rowid, new.content);
			END;
		`);

		// Metadata table for file hashes and other info
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS meta (
				key TEXT PRIMARY KEY,
				value TEXT
			);
		`);

		// File hashes table for tracking sync state
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS file_hashes (
				file_path TEXT PRIMARY KEY,
				hash TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
		`);
	}

	/**
	 * Prepare common SQL statements
	 */
	private prepareStatements(): void {
		if (!this.db) return;

		this.statements.set(
			"upsertChunk",
			this.db.prepare(`
			INSERT INTO chunks (id, file_path, line_start, line_end, content, embedding, created_at, updated_at)
			VALUES (@id, @filePath, @lineStart, @lineEnd, @content, @embedding, @createdAt, @updatedAt)
			ON CONFLICT(id) DO UPDATE SET
				content = excluded.content,
				embedding = excluded.embedding,
				updated_at = excluded.updated_at
		`),
		);

		this.statements.set(
			"deleteByFile",
			this.db.prepare(`
			DELETE FROM chunks WHERE file_path = @filePath
		`),
		);

		this.statements.set(
			"getFileHash",
			this.db.prepare(`
			SELECT hash, updated_at as updatedAt FROM file_hashes WHERE file_path = @filePath
		`),
		);

		this.statements.set(
			"setFileHash",
			this.db.prepare(`
			INSERT INTO file_hashes (file_path, hash, updated_at)
			VALUES (@filePath, @hash, @updatedAt)
			ON CONFLICT(file_path) DO UPDATE SET
				hash = excluded.hash,
				updated_at = excluded.updated_at
		`),
		);

		this.statements.set(
			"deleteFileHash",
			this.db.prepare(`
			DELETE FROM file_hashes WHERE file_path = @filePath
		`),
		);

		this.statements.set(
			"searchFTS",
			this.db.prepare(`
			SELECT 
				c.id,
				c.file_path as filePath,
				c.line_start as lineStart,
				c.line_end as lineEnd,
				c.content,
				c.embedding,
				c.created_at as createdAt,
				c.updated_at as updatedAt,
				rank as ftsRank
			FROM chunks_fts
			JOIN chunks c ON c.rowid = chunks_fts.rowid
			WHERE chunks_fts MATCH @query
			ORDER BY rank
			LIMIT @limit
		`),
		);

		this.statements.set(
			"getAllChunks",
			this.db.prepare(`
			SELECT 
				id,
				file_path as filePath,
				line_start as lineStart,
				line_end as lineEnd,
				content,
				embedding,
				created_at as createdAt,
				updated_at as updatedAt
			FROM chunks
		`),
		);

		this.statements.set(
			"getChunksByFile",
			this.db.prepare(`
			SELECT 
				id,
				file_path as filePath,
				line_start as lineStart,
				line_end as lineEnd,
				content,
				embedding,
				created_at as createdAt,
				updated_at as updatedAt
			FROM chunks
			WHERE file_path = @filePath
		`),
		);

		this.statements.set(
			"getStats",
			this.db.prepare(`
			SELECT 
				(SELECT COUNT(*) FROM chunks) as chunkCount,
				(SELECT COUNT(DISTINCT file_path) FROM chunks) as fileCount,
				(SELECT COUNT(*) FROM file_hashes) as trackedFileCount
		`),
		);

		this.statements.set(
			"getMeta",
			this.db.prepare(`
			SELECT value FROM meta WHERE key = @key
		`),
		);

		this.statements.set(
			"setMeta",
			this.db.prepare(`
			INSERT INTO meta (key, value) VALUES (@key, @value)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value
		`),
		);
	}

	/**
	 * Upsert chunks (insert or update)
	 */
	upsertChunks(chunks: Chunk[]): void {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("upsertChunk");
		if (!stmt) throw new Error("Statement not prepared");

		const insert = this.db.transaction((items: Chunk[]) => {
			for (const chunk of items) {
				stmt.run({
					id: chunk.id,
					filePath: chunk.filePath,
					lineStart: chunk.lineStart,
					lineEnd: chunk.lineEnd,
					content: chunk.content,
					embedding: chunk.embedding ? Buffer.from(chunk.embedding.buffer) : null,
					createdAt: chunk.createdAt,
					updatedAt: chunk.updatedAt,
				});
			}
		});

		insert(chunks);
	}

	/**
	 * Delete all chunks for a file
	 */
	deleteByFile(filePath: string): void {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("deleteByFile");
		if (!stmt) throw new Error("Statement not prepared");

		stmt.run({ filePath });
	}

	/**
	 * Get stored hash for a file
	 */
	getFileHash(filePath: string): FileHash | undefined {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("getFileHash");
		if (!stmt) throw new Error("Statement not prepared");

		const result = stmt.get({ filePath }) as { hash: string; updatedAt: string } | undefined;
		if (!result) return undefined;

		return {
			filePath,
			hash: result.hash,
			updatedAt: result.updatedAt,
		};
	}

	/**
	 * Set hash for a file
	 */
	setFileHash(filePath: string, hash: string): void {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("setFileHash");
		if (!stmt) throw new Error("Statement not prepared");

		stmt.run({
			filePath,
			hash,
			updatedAt: new Date().toISOString(),
		});
	}

	/**
	 * Delete file hash tracking
	 */
	deleteFileHash(filePath: string): void {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("deleteFileHash");
		if (!stmt) throw new Error("Statement not prepared");

		stmt.run({ filePath });
	}

	/**
	 * Search using FTS5
	 */
	searchFTS(query: string, limit: number): Chunk[] {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("searchFTS");
		if (!stmt) throw new Error("Statement not prepared");

		// Escape special FTS5 characters
		const escapedQuery = query
			.replace(/"/g, '""')
			.split(/\s+/)
			.map((term) => `"${term}"`)
			.join(" ");

		const rows = stmt.all({ query: escapedQuery, limit }) as Array<{
			id: string;
			filePath: string;
			lineStart: number;
			lineEnd: number;
			content: string;
			embedding: Buffer | null;
			createdAt: string;
			updatedAt: string;
		}>;

		return rows.map((row) => ({
			id: row.id,
			filePath: row.filePath,
			lineStart: row.lineStart,
			lineEnd: row.lineEnd,
			content: row.content,
			embedding: row.embedding ? new Float64Array(row.embedding.buffer) : undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		}));
	}

	/**
	 * Get all chunks with embeddings for vector search
	 */
	getAllChunksWithEmbeddings(): Chunk[] {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("getAllChunks");
		if (!stmt) throw new Error("Statement not prepared");

		const rows = stmt.all() as Array<{
			id: string;
			filePath: string;
			lineStart: number;
			lineEnd: number;
			content: string;
			embedding: Buffer | null;
			createdAt: string;
			updatedAt: string;
		}>;

		return rows
			.filter((row) => row.embedding !== null)
			.map((row) => ({
				id: row.id,
				filePath: row.filePath,
				lineStart: row.lineStart,
				lineEnd: row.lineEnd,
				content: row.content,
				embedding: row.embedding ? new Float64Array(row.embedding.buffer) : undefined,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			}));
	}

	/**
	 * Get database stats
	 */
	getStats(): { chunkCount: number; fileCount: number; trackedFileCount: number } {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("getStats");
		if (!stmt) throw new Error("Statement not prepared");

		return stmt.get() as { chunkCount: number; fileCount: number; trackedFileCount: number };
	}

	/**
	 * Get metadata value
	 */
	getMeta(key: string): string | undefined {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("getMeta");
		if (!stmt) throw new Error("Statement not prepared");

		const result = stmt.get({ key }) as { value: string } | undefined;
		return result?.value;
	}

	/**
	 * Set metadata value
	 */
	setMeta(key: string, value: string): void {
		if (!this.db) throw new Error("Database not open");

		const stmt = this.statements.get("setMeta");
		if (!stmt) throw new Error("Statement not prepared");

		stmt.run({ key, value });
	}
}

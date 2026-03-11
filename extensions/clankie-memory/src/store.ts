/**
 * TursoDB-based memory store for clankie-memory
 * Uses native vector functions (F8_BLOB, vector_distance_cos) and FTS5
 */

import type { Memory, MemoryConfig, MemorySearchResult } from "./types.ts";

// Dynamic import for TursoDB
let connectFn: typeof import("@tursodatabase/database").connect;

export class MemoryStore {
	private db: Awaited<ReturnType<typeof connectFn>> | null = null;
	private config: MemoryConfig;
	private hasFts = false;
	private capabilityProbeLogged = false;

	constructor(config: MemoryConfig) {
		this.config = config;
	}

	/**
	 * Open the database and initialize schema
	 */
	async open(): Promise<void> {
		if (!connectFn) {
			const mod = await import("@tursodatabase/database");
			connectFn = mod.connect;
		}

		this.db = await connectFn(this.config.dbPath);

		await this.initializeSchema();
	}

	/**
	 * Close the database
	 */
	async close(): Promise<void> {
		if (this.db) {
			await this.db.close();
			this.db = null;
		}
	}

	private formatError(err: unknown): string {
		if (err instanceof Error) return err.message;
		if (typeof err === "string") return err;
		try {
			return JSON.stringify(err);
		} catch {
			return String(err);
		}
	}

	private async logCapabilityProbe(reason: string, err?: unknown): Promise<void> {
		if (!this.db || this.capabilityProbeLogged) return;
		this.capabilityProbeLogged = true;

		console.warn(`[memory] Capability probe (${reason}) for db: ${this.config.dbPath}`);
		if (err) {
			console.warn(`[memory] Triggering error: ${this.formatError(err)}`);
		}

		try {
			const row = await this.db.prepare(`SELECT sqlite_version() AS version`).get();
			const version = (row as Record<string, unknown> | null)?.version;
			if (version) {
				console.warn(`[memory] sqlite_version(): ${String(version)}`);
			}
		} catch (versionErr) {
			console.warn(`[memory] sqlite_version() probe failed: ${this.formatError(versionErr)}`);
		}

		try {
			await this.db.prepare(`SELECT vector_distance_cos(vector8('[1,0]'), vector8('[1,0]')) AS score`).get();
			console.warn(`[memory] Vector probe: OK`);
		} catch (vectorErr) {
			console.warn(`[memory] Vector probe: FAILED (${this.formatError(vectorErr)})`);
		}

		const suffix = Math.random().toString(36).slice(2, 10);
		const probeTable = `__memory_fts_probe_${suffix}`;
		const probeIndex = `__memory_fts_probe_idx_${suffix}`;
		try {
			await this.db.exec(`CREATE TABLE "${probeTable}" (id INTEGER PRIMARY KEY, content TEXT);`);
			await this.db.exec(`CREATE INDEX "${probeIndex}" ON "${probeTable}" USING fts(content);`);
			console.warn(`[memory] FTS index-method probe: OK (USING fts is supported)`);
			await this.db.exec(`DROP INDEX "${probeIndex}";`);
			await this.db.exec(`DROP TABLE "${probeTable}";`);
		} catch (ftsErr) {
			console.warn(`[memory] FTS index-method probe: FAILED (${this.formatError(ftsErr)})`);
			try {
				await this.db.exec(`DROP INDEX IF EXISTS "${probeIndex}";`);
				await this.db.exec(`DROP TABLE IF EXISTS "${probeTable}";`);
			} catch {
				// ignore cleanup errors
			}
		}
	}

	/**
	 * Initialize database schema with TursoDB vector support
	 */
	private async initializeSchema(): Promise<void> {
		if (!this.db) return;

		const dimensions = this.config.embedding.dimensions;

		// Main memories table with quantized vector embeddings
		await this.db.exec(`
			CREATE TABLE IF NOT EXISTS memories (
				id              TEXT PRIMARY KEY,
				content         TEXT NOT NULL,
				embedding       F8_BLOB(${dimensions}),
				file_path       TEXT,
				line_start      INTEGER,
				line_end        INTEGER,
				category        TEXT NOT NULL DEFAULT 'chunk',
				created_at      INTEGER NOT NULL,
				updated_at      INTEGER NOT NULL,
				last_retrieved  INTEGER,
				retrieval_count INTEGER DEFAULT 0,
				source_task     TEXT
			);
		`);

		// Index on file_path for faster lookups
		await this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_memories_file_path ON memories(file_path);
		`);

		// Index on category for filtered searches
		await this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
		`);

		// TursoDB FTS using Tantivy (not SQLite FTS5)
		// Try to create FTS index - may fail if index methods are unavailable
		try {
			await this.db.exec(`
				CREATE INDEX IF NOT EXISTS idx_memories_fts 
				ON memories USING fts (content);
			`);
			this.hasFts = true;
			console.log("[memory] FTS index available (USING fts)");
		} catch (err) {
			// FTS not available, will fall back to LIKE search
			this.hasFts = false;
			console.warn(`[memory] FTS index not available, using LIKE-based search: ${this.formatError(err)}`);
			await this.logCapabilityProbe("fts-index-create", err);
		}

		// Metadata table
		await this.db.exec(`
			CREATE TABLE IF NOT EXISTS meta (
				key TEXT PRIMARY KEY,
				value TEXT
			);
		`);

		// File hashes table for tracking sync state
		await this.db.exec(`
			CREATE TABLE IF NOT EXISTS file_hashes (
				file_path TEXT PRIMARY KEY,
				hash TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);

		// Tasks table for tracking what the agent has worked on
		await this.db.exec(`
			CREATE TABLE IF NOT EXISTS tasks (
				id          TEXT PRIMARY KEY,
				description TEXT,
				embedding   F8_BLOB(${dimensions}),
				started_at  INTEGER,
				finished_at INTEGER
			);
		`);

		// Memory usage attribution (which memories were used in which tasks)
		await this.db.exec(`
			CREATE TABLE IF NOT EXISTS memory_usage (
				id         TEXT PRIMARY KEY,
				memory_id  TEXT NOT NULL,
				task_id    TEXT,
				similarity REAL,
				credit     REAL DEFAULT 0,
				used_at    INTEGER NOT NULL,
				FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
				FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
			);
		`);
	}

	/**
	 * Upsert a memory with quantized vector embedding
	 */
	async upsertMemory(memory: Memory): Promise<void> {
		if (!this.db) throw new Error("Database not open");

		const now = Date.now();
		const embeddingJson = memory.embedding ? JSON.stringify(Array.from(memory.embedding)) : null;

		await this.db.prepare(`
			INSERT INTO memories (id, content, embedding, file_path, line_start, line_end, category, created_at, updated_at)
			VALUES (?, ?, CASE WHEN ? IS NULL THEN NULL ELSE vector8(?) END, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				content = excluded.content,
				embedding = excluded.embedding,
				updated_at = excluded.updated_at
		`).run(
			memory.id,
			memory.content,
			embeddingJson,
			embeddingJson,
			memory.filePath ?? null,
			memory.lineStart ?? null,
			memory.lineEnd ?? null,
			memory.category ?? "chunk",
			memory.createdAt ?? now,
			now,
		);
	}

	/**
	 * Upsert multiple memories in a transaction
	 */
	async upsertMemories(memories: Memory[]): Promise<void> {
		if (!this.db) throw new Error("Database not open");
		if (memories.length === 0) return;

		const now = Date.now();

		const insertFn = this.db.transaction(async () => {
			const stmt = this.db!.prepare(`
				INSERT INTO memories (id, content, embedding, file_path, line_start, line_end, category, created_at, updated_at)
				VALUES (?, ?, CASE WHEN ? IS NULL THEN NULL ELSE vector8(?) END, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					content = excluded.content,
					embedding = excluded.embedding,
					updated_at = excluded.updated_at
			`);

			for (const memory of memories) {
				const embeddingJson = memory.embedding ? JSON.stringify(Array.from(memory.embedding)) : null;
				await stmt.run(
					memory.id,
					memory.content,
					embeddingJson,
					embeddingJson,
					memory.filePath ?? null,
					memory.lineStart ?? null,
					memory.lineEnd ?? null,
					memory.category ?? "chunk",
					memory.createdAt ?? now,
					now,
				);
			}
		});

		await insertFn();
	}

	/**
	 * Delete all memories for a file
	 */
	async deleteByFile(filePath: string): Promise<void> {
		if (!this.db) throw new Error("Database not open");
		await this.db.prepare("DELETE FROM memories WHERE file_path = ?").run(filePath);
	}

	/**
	 * Semantic vector search using native vector_distance_cos
	 */
	async vectorSearch(queryEmbedding: number[], limit: number, category?: string): Promise<MemorySearchResult[]> {
		if (!this.db) throw new Error("Database not open");

		const embeddingJson = JSON.stringify(queryEmbedding);

		let sql = `
			SELECT 
				id, content, file_path, line_start, line_end, category,
				created_at, updated_at, retrieval_count,
				vector_distance_cos(embedding, vector8(?)) AS distance
			FROM memories
			WHERE embedding IS NOT NULL
		`;

		const params: (string | number)[] = [embeddingJson];

		if (category) {
			sql += " AND category = ?";
			params.push(category);
		}

		sql += " ORDER BY distance ASC LIMIT ?";
		params.push(limit);

		const rows = await this.db.prepare(sql).all(...params);

		return rows.map((row: Record<string, unknown>) => ({
			memory: {
				id: row.id as string,
				content: row.content as string,
				filePath: row.file_path as string | undefined,
				lineStart: row.line_start as number | undefined,
				lineEnd: row.line_end as number | undefined,
				category: row.category as string,
				createdAt: row.created_at as number,
				updatedAt: row.updated_at as number,
				retrievalCount: row.retrieval_count as number,
			},
			// Convert distance (0=identical, 2=opposite) to similarity (1=identical, -1=opposite)
			score: 1.0 - (row.distance as number),
			vectorScore: 1.0 - (row.distance as number),
		}));
	}

	/**
	 * Text search using Tantivy FTS (or LIKE fallback)
	 * When FTS is available, uses BM25 scoring via fts_score()
	 */
	async textSearch(query: string, limit: number): Promise<MemorySearchResult[]> {
		if (!this.db) throw new Error("Database not open");

		// Try Tantivy FTS first if available
		if (this.hasFts) {
			try {
				const rows = await this.db.prepare(`
					SELECT 
						id, content, file_path, line_start, line_end, category,
						created_at, updated_at, retrieval_count,
						fts_score(content, ?) AS score
					FROM memories
					WHERE content MATCH ?
					ORDER BY score DESC
					LIMIT ?
				`).all(query, query, limit);

				// Normalize scores (BM25 scores aren't bounded)
				const maxScore = rows.length > 0
					? Math.max(...(rows as Record<string, unknown>[]).map((r) => r.score as number))
					: 1;

				return (rows as Record<string, unknown>[]).map((row) => ({
					memory: {
						id: row.id as string,
						content: row.content as string,
						filePath: row.file_path as string | undefined,
						lineStart: row.line_start as number | undefined,
						lineEnd: row.line_end as number | undefined,
						category: row.category as string,
						createdAt: row.created_at as number,
						updatedAt: row.updated_at as number,
						retrievalCount: row.retrieval_count as number,
					},
					score: (row.score as number) / maxScore,
					textScore: (row.score as number) / maxScore,
				}));
			} catch (err) {
				// FTS query failed, fall back to LIKE
				this.hasFts = false;
				console.warn(`[memory] FTS query failed, falling back to LIKE: ${this.formatError(err)}`);
				await this.logCapabilityProbe("fts-query", err);
			}
		}

		// Fallback: LIKE-based search
		const terms = query
			.toLowerCase()
			.split(/\s+/)
			.filter((t) => t.length > 2);  // Skip short words

		if (terms.length === 0) return [];

		// Build LIKE conditions for each term
		const conditions = terms.map(() => "LOWER(content) LIKE ?").join(" OR ");
		const params = terms.map((t) => `%${t}%`);

		const rows = await this.db.prepare(`
			SELECT 
				id, content, file_path, line_start, line_end, category,
				created_at, updated_at, retrieval_count
			FROM memories
			WHERE ${conditions}
			LIMIT ?
		`).all(...params, limit * 2);  // Fetch extra for scoring

		// Score results by number of matching terms
		const scored = (rows as Record<string, unknown>[]).map((row) => {
			const contentLower = (row.content as string).toLowerCase();
			let matchCount = 0;
			for (const term of terms) {
				if (contentLower.includes(term)) matchCount++;
			}
			const score = matchCount / terms.length;

			return {
				memory: {
					id: row.id as string,
					content: row.content as string,
					filePath: row.file_path as string | undefined,
					lineStart: row.line_start as number | undefined,
					lineEnd: row.line_end as number | undefined,
					category: row.category as string,
					createdAt: row.created_at as number,
					updatedAt: row.updated_at as number,
					retrievalCount: row.retrieval_count as number,
				},
				score,
				textScore: score,
			};
		});

		// Sort by score and limit
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, limit);
	}

	/**
	 * Alias for backward compatibility
	 */
	async ftsSearch(query: string, limit: number): Promise<MemorySearchResult[]> {
		return this.textSearch(query, limit);
	}

	/**
	 * Hybrid search combining FTS5 + vector similarity
	 */
	async hybridSearch(
		query: string,
		queryEmbedding: number[] | null,
		limit: number,
		options?: {
			textWeight?: number;
			vectorWeight?: number;
			category?: string;
		},
	): Promise<MemorySearchResult[]> {
		if (!this.db) throw new Error("Database not open");

		const textWeight = options?.textWeight ?? 0.3;
		const vectorWeight = options?.vectorWeight ?? 0.7;
		const candidateLimit = limit * 4;

		// Get FTS candidates
		const ftsResults = await this.ftsSearch(query, candidateLimit);
		const ftsMap = new Map(ftsResults.map((r) => [r.memory.id, r]));

		// Get vector candidates if embedding provided
		let vectorMap = new Map<string, MemorySearchResult>();
		if (queryEmbedding) {
			const vectorResults = await this.vectorSearch(queryEmbedding, candidateLimit, options?.category);
			vectorMap = new Map(vectorResults.map((r) => [r.memory.id, r]));
		}

		// Merge results
		const allIds = new Set([...ftsMap.keys(), ...vectorMap.keys()]);
		const merged: MemorySearchResult[] = [];

		for (const id of allIds) {
			const ftsResult = ftsMap.get(id);
			const vectorResult = vectorMap.get(id);

			const textScore = ftsResult?.textScore ?? 0;
			const vectorScore = vectorResult?.vectorScore ?? 0;
			const combinedScore = textScore * textWeight + vectorScore * vectorWeight;

			merged.push({
				memory: (ftsResult ?? vectorResult)!.memory,
				score: combinedScore,
				textScore: textScore || undefined,
				vectorScore: vectorScore || undefined,
			});
		}

		// Sort by combined score and limit
		merged.sort((a, b) => b.score - a.score);
		return merged.slice(0, limit);
	}

	/**
	 * Update retrieval metadata after a memory is used
	 */
	async markRetrieved(memoryIds: string[], taskId?: string): Promise<void> {
		if (!this.db) throw new Error("Database not open");

		const now = Date.now();

		const updateFn = this.db.transaction(async () => {
			// Update retrieval count
			const updateStmt = this.db!.prepare(`
				UPDATE memories 
				SET last_retrieved = ?, retrieval_count = retrieval_count + 1
				WHERE id = ?
			`);

			// Record usage
			const usageStmt = this.db!.prepare(`
				INSERT INTO memory_usage (id, memory_id, task_id, used_at)
				VALUES (?, ?, ?, ?)
			`);

			for (const memoryId of memoryIds) {
				await updateStmt.run(now, memoryId);

				const usageId = `${memoryId}-${now}-${Math.random().toString(36).slice(2, 8)}`;
				await usageStmt.run(usageId, memoryId, taskId ?? null, now);
			}
		});

		await updateFn();
	}

	/**
	 * Prune old unused memories
	 */
	async pruneUnused(maxAgeDays: number): Promise<number> {
		if (!this.db) throw new Error("Database not open");

		const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

		const result = await this.db.prepare(`
			DELETE FROM memories
			WHERE retrieval_count = 0 AND created_at < ?
		`).run(cutoff);

		return result.changes;
	}

	/**
	 * Get stored hash for a file
	 */
	async getFileHash(filePath: string): Promise<{ hash: string; updatedAt: number } | undefined> {
		if (!this.db) throw new Error("Database not open");

		const row = await this.db.prepare(`
			SELECT hash, updated_at FROM file_hashes WHERE file_path = ?
		`).get(filePath);

		if (!row) return undefined;
		return {
			hash: (row as Record<string, unknown>).hash as string,
			updatedAt: (row as Record<string, unknown>).updated_at as number,
		};
	}

	/**
	 * Set hash for a file
	 */
	async setFileHash(filePath: string, hash: string): Promise<void> {
		if (!this.db) throw new Error("Database not open");

		await this.db.prepare(`
			INSERT INTO file_hashes (file_path, hash, updated_at)
			VALUES (?, ?, ?)
			ON CONFLICT(file_path) DO UPDATE SET
				hash = excluded.hash,
				updated_at = excluded.updated_at
		`).run(filePath, hash, Date.now());
	}

	/**
	 * Delete file hash tracking
	 */
	async deleteFileHash(filePath: string): Promise<void> {
		if (!this.db) throw new Error("Database not open");
		await this.db.prepare("DELETE FROM file_hashes WHERE file_path = ?").run(filePath);
	}

	/**
	 * Clear all file hashes (forces full reindex)
	 */
	async clearAllFileHashes(): Promise<void> {
		if (!this.db) throw new Error("Database not open");
		await this.db.exec("DELETE FROM file_hashes");
	}

	/**
	 * Get database stats
	 */
	async getStats(): Promise<{
		memoryCount: number;
		fileCount: number;
		trackedFileCount: number;
		categoryCounts: Record<string, number>;
	}> {
		if (!this.db) throw new Error("Database not open");

		const counts = (await this.db.prepare(`
			SELECT 
				(SELECT COUNT(*) FROM memories) as memory_count,
				(SELECT COUNT(DISTINCT file_path) FROM memories) as file_count,
				(SELECT COUNT(*) FROM file_hashes) as tracked_file_count
		`).get()) as Record<string, number>;

		const categories = (await this.db.prepare(`
			SELECT category, COUNT(*) as count FROM memories GROUP BY category
		`).all()) as Array<{ category: string; count: number }>;

		const categoryCounts: Record<string, number> = {};
		for (const row of categories) {
			categoryCounts[row.category] = row.count;
		}

		return {
			memoryCount: counts.memory_count,
			fileCount: counts.file_count,
			trackedFileCount: counts.tracked_file_count,
			categoryCounts,
		};
	}

	/**
	 * Get metadata value
	 */
	async getMeta(key: string): Promise<string | undefined> {
		if (!this.db) throw new Error("Database not open");

		const row = await this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
		return row ? ((row as Record<string, unknown>).value as string) : undefined;
	}

	/**
	 * Set metadata value
	 */
	async setMeta(key: string, value: string): Promise<void> {
		if (!this.db) throw new Error("Database not open");

		await this.db.prepare(`
			INSERT INTO meta (key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value
		`).run(key, value);
	}
}

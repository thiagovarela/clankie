/**
 * lil memory database — SQLite + FTS5 persistent memory
 *
 * Inspired by nullclaw's memory architecture. Uses Bun's built-in SQLite
 * for zero-dependency, fast, searchable persistent memory.
 *
 * Features:
 *   - FTS5 full-text search with BM25 scoring
 *   - Memory categories (core, daily, conversation, custom)
 *   - Upsert semantics (same key updates instead of duplicating)
 *   - Per-message context recall (search relevant memories)
 *   - Forget/delete individual entries
 *   - Hygiene (auto-cleanup of old daily/conversation entries)
 *
 * Storage: ~/.lil/memory.db
 */

import { Database, type Statement } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MemoryCategory = "core" | "daily" | "conversation" | string;

export interface MemoryEntry {
	id: string;
	key: string;
	content: string;
	category: MemoryCategory;
	createdAt: string;
	updatedAt: string;
	sessionId: string | null;
	/** Persona name (NULL = global, accessible to all personas) */
	persona: string | null;
	/** BM25 relevance score (lower = more relevant for FTS5, we negate it) */
	score?: number;
}

export interface MemoryStats {
	total: number;
	byCategory: Record<string, number>;
}

// ─── Database ──────────────────────────────────────────────────────────────────

export class MemoryDB {
	private db: Database;
	private stmts: {
		store: Statement;
		get: Statement;
		forget: Statement;
		count: Statement;
		listAll: Statement;
		listByCategory: Statement;
		ftsSearch: Statement;
		likeSearch: Statement;
		countByCategory: Statement;
		pruneOld: Statement;
	};

	constructor(dbPath: string) {
		// Ensure directory exists
		const dir = dirname(dbPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
		}

		this.db = new Database(dbPath);
		this.configurePragmas();
		this.migrate();
		this.stmts = this.prepareStatements();
	}

	private configurePragmas(): void {
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA synchronous = NORMAL");
		this.db.exec("PRAGMA temp_store = MEMORY");
		this.db.exec("PRAGMA cache_size = -2000");
	}

	private migrate(): void {
		// Check if we need to add persona column (migration v2)
		const tableInfo = this.db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>;
		const hasPersonaColumn = tableInfo.some((col) => col.name === "persona");

		if (!hasPersonaColumn && tableInfo.length > 0) {
			// Existing table without persona column — migrate
			console.log("[memory] Migrating database to add persona column...");

			this.db.exec(`
				BEGIN TRANSACTION;
				
				-- Add persona column (NULL = global, accessible to all personas)
				ALTER TABLE memories ADD COLUMN persona TEXT DEFAULT NULL;
				
				-- Create new table with updated unique constraint
				CREATE TABLE memories_new (
					id         TEXT PRIMARY KEY,
					key        TEXT NOT NULL,
					content    TEXT NOT NULL,
					category   TEXT NOT NULL DEFAULT 'core',
					session_id TEXT,
					persona    TEXT,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL,
					UNIQUE(key, persona)
				);
				
				-- Copy data
				INSERT INTO memories_new SELECT id, key, content, category, session_id, persona, created_at, updated_at FROM memories;
				
				-- Drop old table and rename
				DROP TABLE memories;
				ALTER TABLE memories_new RENAME TO memories;
				
				-- Recreate indexes
				CREATE INDEX idx_memories_category ON memories(category);
				CREATE INDEX idx_memories_key ON memories(key);
				CREATE INDEX idx_memories_persona ON memories(persona);
				CREATE INDEX idx_memories_session ON memories(session_id);
				CREATE INDEX idx_memories_updated ON memories(updated_at);
				
				COMMIT;
			`);

			console.log("[memory] Migration complete. Existing memories are now global (persona = NULL).");
		} else if (tableInfo.length === 0) {
			// Fresh database — create with persona column from the start
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS memories (
					id         TEXT PRIMARY KEY,
					key        TEXT NOT NULL,
					content    TEXT NOT NULL,
					category   TEXT NOT NULL DEFAULT 'core',
					session_id TEXT,
					persona    TEXT,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL,
					UNIQUE(key, persona)
				);
				CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
				CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
				CREATE INDEX IF NOT EXISTS idx_memories_persona ON memories(persona);
				CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
				CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at);
			`);
		}

		// FTS5 virtual table for full-text search (BM25 scoring)
		// Wrapped in try/catch because FTS5 creation fails silently if already exists
		try {
			this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          key, content, content=memories, content_rowid=rowid
        );
      `);
		} catch {
			// FTS5 table might already exist
		}

		// FTS5 sync triggers — keep search index in sync with memories table
		this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, key, content)
        VALUES (new.rowid, new.key, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, content)
        VALUES ('delete', old.rowid, old.key, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, content)
        VALUES ('delete', old.rowid, old.key, old.content);
        INSERT INTO memories_fts(rowid, key, content)
        VALUES (new.rowid, new.key, new.content);
      END;
    `);
	}

	private prepareStatements() {
		return {
			store: this.db.prepare(`
        INSERT INTO memories (id, key, content, category, session_id, persona, created_at, updated_at)
        VALUES ($id, $key, $content, $category, $sessionId, $persona, $now, $now)
        ON CONFLICT(key, persona) DO UPDATE SET
          content = excluded.content,
          category = excluded.category,
          session_id = excluded.session_id,
          updated_at = excluded.updated_at
      `),

			get: this.db.prepare(`
        SELECT id, key, content, category, session_id, persona, created_at, updated_at
        FROM memories WHERE key = $key AND (persona = $persona OR (persona IS NULL AND $persona IS NOT NULL))
      `),

			forget: this.db.prepare(`DELETE FROM memories WHERE key = $key AND persona = $persona`),

			count: this.db.prepare(`SELECT COUNT(*) as count FROM memories`),

			listAll: this.db.prepare(`
        SELECT id, key, content, category, session_id, persona, created_at, updated_at
        FROM memories 
        WHERE persona = $persona OR persona IS NULL
        ORDER BY updated_at DESC LIMIT $limit
      `),

			listByCategory: this.db.prepare(`
        SELECT id, key, content, category, session_id, persona, created_at, updated_at
        FROM memories 
        WHERE category = $category AND (persona = $persona OR persona IS NULL)
        ORDER BY updated_at DESC LIMIT $limit
      `),

			ftsSearch: this.db.prepare(`
        SELECT m.id, m.key, m.content, m.category, m.session_id, m.persona, m.created_at, m.updated_at,
               bm25(memories_fts) as score
        FROM memories_fts f
        JOIN memories m ON m.rowid = f.rowid
        WHERE memories_fts MATCH $query
          AND (m.persona = $persona OR m.persona IS NULL)
        ORDER BY score
        LIMIT $limit
      `),

			likeSearch: this.db.prepare(`
        SELECT id, key, content, category, session_id, persona, created_at, updated_at
        FROM memories
        WHERE (content LIKE $pattern OR key LIKE $pattern)
          AND (persona = $persona OR persona IS NULL)
        ORDER BY updated_at DESC
        LIMIT $limit
      `),

			countByCategory: this.db.prepare(`
        SELECT category, COUNT(*) as count FROM memories 
        WHERE persona = $persona OR persona IS NULL
        GROUP BY category
      `),

			pruneOld: this.db.prepare(`
        DELETE FROM memories
        WHERE category = $category
        AND updated_at < $cutoff
      `),
		};
	}

	// ─── Core operations ──────────────────────────────────────────────

	/**
	 * Store a memory. Uses upsert — same key + persona updates existing content.
	 * @param persona Persona name (null = global, accessible to all personas)
	 */
	store(
		key: string,
		content: string,
		category: MemoryCategory = "core",
		persona: string | null = null,
		sessionId?: string,
	): void {
		const id = generateId();
		const now = new Date().toISOString();
		this.stmts.store.run({
			$id: id,
			$key: key,
			$content: content,
			$category: category,
			$sessionId: sessionId ?? null,
			$persona: persona,
			$now: now,
		});
	}

	/**
	 * Get a memory by exact key for a specific persona (or global).
	 * Returns null if not found.
	 * @param persona Persona name (searches both persona-specific and global memories)
	 */
	get(key: string, persona: string | null = null): MemoryEntry | null {
		const row = this.stmts.get.get({ $key: key, $persona: persona }) as any;
		return row ? rowToEntry(row) : null;
	}

	/**
	 * Delete a memory by key and persona. Returns true if something was deleted.
	 * @param persona Persona name (null = delete global memory)
	 */
	forget(key: string, persona: string | null = null): boolean {
		const result = this.stmts.forget.run({ $key: key, $persona: persona });
		return result.changes > 0;
	}

	/**
	 * Search memories using FTS5 full-text search.
	 * Searches both persona-specific and global memories.
	 * Falls back to LIKE search if FTS5 query fails.
	 * @param persona Persona name (searches both persona-specific and global memories)
	 */
	recall(query: string, persona: string | null = null, limit: number = 5): MemoryEntry[] {
		const trimmed = query.trim();
		if (!trimmed) return [];

		// Try FTS5 first
		try {
			const ftsQuery = buildFtsQuery(trimmed);
			const rows = this.stmts.ftsSearch.all({ $query: ftsQuery, $persona: persona, $limit: limit }) as any[];
			if (rows.length > 0) {
				return rows.map((row) => ({
					...rowToEntry(row),
					score: typeof row.score === "number" ? -row.score : undefined, // BM25 returns negative
				}));
			}
		} catch {
			// FTS5 might reject certain queries — fall back to LIKE
		}

		// Fallback: LIKE search on each word
		const pattern = `%${trimmed}%`;
		const rows = this.stmts.likeSearch.all({ $pattern: pattern, $persona: persona, $limit: limit }) as any[];
		return rows.map((row) => ({ ...rowToEntry(row), score: 1.0 }));
	}

	/**
	 * List memories, optionally filtered by category.
	 * @param persona Persona name (lists both persona-specific and global memories)
	 */
	list(category?: MemoryCategory, persona: string | null = null, limit: number = 100): MemoryEntry[] {
		const rows = category
			? (this.stmts.listByCategory.all({ $category: category, $persona: persona, $limit: limit }) as any[])
			: (this.stmts.listAll.all({ $persona: persona, $limit: limit }) as any[]);
		return rows.map(rowToEntry);
	}

	/**
	 * Get memory statistics.
	 * @param persona Persona name (counts both persona-specific and global memories)
	 */
	stats(persona: string | null = null): MemoryStats {
		const total = (this.stmts.count.get() as any)?.count ?? 0;
		const rows = this.stmts.countByCategory.all({ $persona: persona }) as any[];
		const byCategory: Record<string, number> = {};
		for (const row of rows) {
			byCategory[row.category] = row.count;
		}
		return { total, byCategory };
	}

	/**
	 * Build a memory context preamble for the agent prompt.
	 * Searches memories relevant to the user's message and formats them.
	 * @param persona Persona name (searches both persona-specific and global memories)
	 */
	buildContext(userMessage: string, persona: string | null = null, limit: number = 5): string {
		const entries = this.recall(userMessage, persona, limit);
		if (entries.length === 0) return "";

		const lines = entries.map((e) => `- **${e.key}** (${e.category}): ${e.content}`);
		return `### Recalled Memories\n\nRelevant memories found for this conversation:\n\n${lines.join("\n")}`;
	}

	/**
	 * Prune old entries by category.
	 * Removes entries older than `days` for the given category.
	 */
	prune(category: MemoryCategory, days: number): number {
		const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
		const result = this.stmts.pruneOld.run({ $category: category, $cutoff: cutoff });
		return result.changes;
	}

	/**
	 * Run hygiene: prune old daily and conversation entries.
	 * Returns total entries pruned.
	 */
	runHygiene(options?: { dailyRetentionDays?: number; conversationRetentionDays?: number }): number {
		const dailyDays = options?.dailyRetentionDays ?? 30;
		const convDays = options?.conversationRetentionDays ?? 7;

		let total = 0;
		total += this.prune("daily", dailyDays);
		total += this.prune("conversation", convDays);
		return total;
	}

	/**
	 * Rebuild the FTS5 index. Use after manual database edits.
	 */
	reindex(): void {
		this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
	}

	/**
	 * Export all core memories as JSON (for backup/migration).
	 */
	exportCore(): MemoryEntry[] {
		return this.list("core", 10000);
	}

	/**
	 * Import memories from an array (for restore/migration).
	 * Uses upsert so existing keys are updated.
	 */
	import(entries: { key: string; content: string; category?: MemoryCategory }[]): number {
		let imported = 0;
		const tx = this.db.transaction(() => {
			for (const entry of entries) {
				this.store(entry.key, entry.content, entry.category ?? "core");
				imported++;
			}
		});
		tx();
		return imported;
	}

	/**
	 * Close the database connection.
	 */
	close(): void {
		this.db.close();
	}
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
	const ts = Date.now().toString(36);
	const rand = Math.random().toString(36).slice(2, 8);
	return `${ts}-${rand}`;
}

function rowToEntry(row: any): MemoryEntry {
	return {
		id: row.id,
		key: row.key,
		content: row.content,
		category: row.category,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		sessionId: row.session_id ?? null,
		persona: row.persona ?? null,
	};
}

/**
 * Build an FTS5 query from a natural language string.
 * Wraps each word in quotes and joins with OR for broad matching.
 */
function buildFtsQuery(input: string): string {
	const words = input
		.split(/\s+/)
		.filter((w) => w.length > 0)
		.map((w) => `"${w.replace(/"/g, '""')}"`);

	if (words.length === 0) return '""';
	return words.join(" OR ");
}

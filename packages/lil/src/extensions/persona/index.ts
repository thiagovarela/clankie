/**
 * lil persona extension
 *
 * Loads personality and instructions from ~/.lil/personas/<name>/ flat files,
 * and manages persistent memory via SQLite + FTS5.
 *
 * Flat files (user-editable persona config):
 *
 *   ~/.lil/personas/<name>/
 *   ├── identity.md      — Who the persona is: name, voice, personality traits
 *   ├── instructions.md  — Standing orders: how to behave, what to avoid
 *   ├── knowledge.md     — Facts about the user: preferences, context, environment
 *   └── persona.json     — Optional: { "model": "provider/model" }
 *
 * SQLite memory (auto-managed by tools):
 *
 *   ~/.lil/memory.db     — FTS5-indexed persistent memory (shared across all personas)
 *     categories: core (permanent facts), daily (session notes), conversation (chat context)
 *
 * Memory model (inspired by nullclaw):
 *   - Per-message recall: before each agent turn, relevant memories are searched
 *     and injected into context. The agent gets memories without asking.
 *   - memory_store: persist facts with key/content/category (upsert semantics)
 *   - memory_recall: search memories by natural language query (FTS5)
 *   - memory_forget: delete a memory by key
 *   - Hygiene: old daily/conversation entries auto-pruned
 *
 * The extension also provides:
 *   - persona_info: inspect loaded persona files + memory stats
 *   - persona_edit: read/write persona flat files
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { MemoryDB, type MemoryCategory } from "./memory-db.ts";

// ─── Persona file definitions ──────────────────────────────────────────────────

interface PersonaFile {
  filename: string;
  title: string;
  description: string;
}

const PERSONA_FILES: PersonaFile[] = [
  {
    filename: "identity.md",
    title: "Identity",
    description: "Who you are: name, voice, personality traits",
  },
  {
    filename: "instructions.md",
    title: "Standing Instructions",
    description: "How to behave, what to do and avoid",
  },
  {
    filename: "knowledge.md",
    title: "User Knowledge",
    description: "Facts about the user: preferences, context, environment",
  },
];

// ─── Extension factory ────────────────────────────────────────────────────────

/**
 * Create a persona extension configured for a specific persona.
 * @param personaName Name of the persona to load (default: "default")
 */
export function createPersonaExtension(personaName: string = "default") {
  return function personaExtension(pi: ExtensionAPI) {
    const personaDir = join(homedir(), ".lil", "personas", personaName);
    const memoryDbPath = join(homedir(), ".lil", "memory.db");

  /** Loaded persona file sections (refreshed on session_start) */
  let sections: { title: string; content: string }[] = [];

  /** Memory database (initialized once, reused across sessions) */
  let memoryDb: MemoryDB | null = null;

  function getMemoryDb(): MemoryDB {
    if (!memoryDb) {
      memoryDb = new MemoryDB(memoryDbPath);
    }
    return memoryDb;
  }

  // ─── Load persona files + run hygiene on session start ────────────────

  pi.on("session_start", async (_event, _ctx) => {
    sections = [];

    if (existsSync(personaDir)) {
      for (const pf of PERSONA_FILES) {
        const filePath = join(personaDir, pf.filename);
        if (existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, "utf-8").trim();
            if (content) {
              sections.push({ title: pf.title, content });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    // Run memory hygiene (prune old daily/conversation entries)
    try {
      const db = getMemoryDb();
      const pruned = db.runHygiene();
      if (pruned > 0) {
        console.log(`[persona] Memory hygiene: pruned ${pruned} old entries`);
      }
    } catch {
      // Non-fatal
    }

    // Log loaded state
    const parts: string[] = sections.map((s) => s.title);
    try {
      const stats = getMemoryDb().stats();
      if (stats.total > 0) {
        parts.push(`memory (${stats.total} entries)`);
      }
    } catch {
      // Non-fatal
    }
    if (parts.length > 0) {
      console.log(`[persona:${personaName}] Loaded: ${parts.join(", ")}`);
    }
  });

  // ─── Inject persona + recalled memories into system prompt ────────────

  pi.on("before_agent_start", async (event) => {
    const parts: string[] = [];

    // Persona flat files (identity, instructions, knowledge)
    if (sections.length > 0) {
      parts.push(
        sections.map((s) => `### ${s.title}\n\n${s.content}`).join("\n\n")
      );
    }

    // Core memories (always included — these are permanent facts)
    try {
      const db = getMemoryDb();
      const coreMemories = db.list("core", 50);
      if (coreMemories.length > 0) {
        const lines = coreMemories.map((m) => `- **${m.key}**: ${m.content}`);
        parts.push(`### Core Memories\n\nImportant facts persisted across sessions:\n\n${lines.join("\n")}`);
      }
    } catch {
      // Non-fatal
    }

    if (parts.length === 0) return undefined;

    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n## Persona\n\nThe following defines who you are and how you should behave. ` +
        `Follow these instructions closely — they come directly from your user.\n\n` +
        parts.join("\n\n"),
    };
  });

  // ─── memory_store — persist facts to SQLite ───────────────────────────

  pi.registerTool({
    name: "memory_store",
    label: "Store Memory",
    description:
      "Save a fact, preference, or note to persistent memory. Uses upsert — " +
      "if a memory with the same key already exists, it will be updated.\n\n" +
      "Categories:\n" +
      "- **core**: Permanent facts (user preferences, important context). Always loaded.\n" +
      "- **daily**: Session notes, what happened today. Auto-pruned after 30 days.\n" +
      "- **conversation**: Chat context. Auto-pruned after 7 days.\n\n" +
      "Use 'core' for things worth remembering forever, 'daily' for today's context.\n\n" +
      "Examples:\n" +
      '  key: "user_lang", content: "Prefers TypeScript over JavaScript", category: "core"\n' +
      '  key: "today_project", content: "Working on lil memory system", category: "daily"\n' +
      '  key: "meeting_notes", content: "Discussed migration to SQLite", category: "daily"',
    parameters: Type.Object({
      key: Type.String({
        description:
          "Unique key for this memory. Use snake_case, be descriptive. " +
          'Examples: "user_name", "preferred_stack", "project_lil_status"',
      }),
      content: Type.String({
        description: "The information to remember. Be concise but complete.",
      }),
      category: Type.Optional(
        StringEnum(["core", "daily", "conversation"] as const, {
          description: "Memory category (default: core)",
        })
      ),
    }),
    async execute(_toolCallId, params) {
      try {
        const db = getMemoryDb();
        const category = (params.category ?? "core") as MemoryCategory;
        db.store(params.key, params.content, category);

        return {
          content: [
            {
              type: "text" as const,
              text: `Stored memory: **${params.key}** (${category})`,
            },
          ],
          details: { key: params.key, category },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error storing memory: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ─── memory_recall — search memories via FTS5 ─────────────────────────

  pi.registerTool({
    name: "memory_recall",
    label: "Recall Memory",
    description:
      "Search persistent memory for relevant facts, preferences, or context. " +
      "Uses full-text search (FTS5) with BM25 ranking — just describe what you're " +
      "looking for in natural language.\n\n" +
      "Use this when:\n" +
      "- The user asks about something you might have stored before\n" +
      "- You need to recall preferences, facts, or context\n" +
      "- You want to check what you know about a topic\n\n" +
      "Memories are also automatically recalled based on user messages, " +
      "so you often don't need to call this explicitly.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "What to search for. Natural language works — e.g. " +
          '"user preferences", "TypeScript project", "meeting notes"',
      }),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default: 5)" })
      ),
      category: Type.Optional(
        Type.String({ description: "Filter by category (core, daily, conversation)" })
      ),
    }),
    async execute(_toolCallId, params) {
      try {
        const db = getMemoryDb();
        let entries = db.recall(params.query, params.limit ?? 5);

        // Filter by category if specified
        if (params.category) {
          entries = entries.filter((e) => e.category === params.category);
        }

        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No memories found matching: "${params.query}"`,
              },
            ],
            details: { query: params.query, found: 0 },
          };
        }

        const lines = entries.map(
          (e, i) => `${i + 1}. **${e.key}** (${e.category}): ${e.content}`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${entries.length} memor${entries.length === 1 ? "y" : "ies"}:\n\n${lines.join("\n")}`,
            },
          ],
          details: { query: params.query, found: entries.length },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error recalling memories: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ─── memory_forget — delete a memory ──────────────────────────────────

  pi.registerTool({
    name: "memory_forget",
    label: "Forget Memory",
    description:
      "Remove a memory by its key. Use this to delete outdated facts, " +
      "incorrect information, or sensitive data the user wants removed.\n\n" +
      "Use memory_recall first to find the exact key.",
    parameters: Type.Object({
      key: Type.String({ description: "The key of the memory to forget" }),
    }),
    async execute(_toolCallId, params) {
      try {
        const db = getMemoryDb();
        const forgotten = db.forget(params.key);

        if (forgotten) {
          return {
            content: [
              { type: "text" as const, text: `Forgot memory: **${params.key}**` },
            ],
            details: { key: params.key, forgotten: true },
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `No memory found with key: "${params.key}"`,
              },
            ],
            details: { key: params.key, forgotten: false },
          };
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ─── persona_info — inspect persona + memory stats ────────────────────

  pi.registerTool({
    name: "persona_info",
    label: "Persona Info",
    description:
      "Show what persona files are loaded and memory statistics. " +
      "Use this if the user asks about your personality, identity, instructions, or memory.",
    parameters: Type.Object({}),
    async execute() {
      const parts: string[] = [];
      const details: Record<string, unknown> = {
        personaName,
        personaDir,
        memoryDbPath,
        sections: sections.map((s) => s.title),
      };

      // Active persona
      parts.push(`**Active Persona**: ${personaName}`);

      // Persona files
      if (sections.length > 0) {
        parts.push(
          `**Persona files** (${personaDir}/):\n\n` +
          sections.map((s) => `### ${s.title}\n\n${s.content}`).join("\n\n---\n\n")
        );
      } else {
        parts.push(
          `No persona files loaded. Create files in ${personaDir}/:\n\n` +
          PERSONA_FILES.map((pf) => `  ${pf.filename} — ${pf.description}`).join("\n")
        );
      }

      // Memory stats
      try {
        const db = getMemoryDb();
        const stats = db.stats();
        details.memoryStats = stats;

        const catLines = Object.entries(stats.byCategory)
          .map(([cat, count]) => `  ${cat}: ${count}`)
          .join("\n");

        parts.push(
          `**Memory** (${memoryDbPath}):\n` +
          `  Total entries: ${stats.total}\n` +
          (catLines ? `  By category:\n${catLines}` : "  (empty)")
        );
      } catch (err) {
        parts.push(`**Memory**: Error — ${err instanceof Error ? err.message : String(err)}`);
      }

      return {
        content: [{ type: "text" as const, text: parts.join("\n\n---\n\n") }],
        details,
      };
    },
  });

  // ─── persona_edit — read/write persona flat files ─────────────────────

  const EDITABLE_FILES = ["identity.md", "instructions.md", "knowledge.md"] as const;

  pi.registerTool({
    name: "persona_edit",
    label: "Edit Persona",
    description:
      "Read or replace the contents of a persona file. " +
      "Use this when the user asks you to change your personality, update instructions, " +
      "or modify knowledge. Files live in ~/.lil/persona/.\n\n" +
      "Available files:\n" +
      "- identity.md — your name, voice, personality traits\n" +
      "- instructions.md — standing orders, how to behave\n" +
      "- knowledge.md — facts about the user\n\n" +
      "For persistent memory (facts learned over time), use memory_store instead.",
    parameters: Type.Object({
      file: StringEnum(EDITABLE_FILES),
      action: StringEnum(["read", "write"] as const, {
        description: "read = show current contents, write = replace file with new content",
      }),
      content: Type.Optional(
        Type.String({ description: "New file content (required when action is 'write')" })
      ),
    }),
    async execute(_toolCallId, params) {
      interface Details { action: string; file: string; success: boolean }
      const filePath = join(personaDir, params.file);
      const result = (
        text: string,
        details: Details,
        isError?: boolean
      ) => ({
        content: [{ type: "text" as const, text }],
        details,
        ...(isError ? { isError } : {}),
      });

      if (params.action === "read") {
        if (!existsSync(filePath)) {
          return result(`File does not exist: ${params.file}`, { action: "read", file: params.file, success: false });
        }
        const text = readFileSync(filePath, "utf-8");
        return result(text, { action: "read", file: params.file, success: true });
      }

      if (!params.content) {
        return result(
          "Error: content is required for write action",
          { action: "write", file: params.file, success: false },
          true
        );
      }

      if (!existsSync(personaDir)) {
        mkdirSync(personaDir, { recursive: true, mode: 0o700 });
      }

      writeFileSync(filePath, params.content, "utf-8");

      // Update in-memory sections
      const title = PERSONA_FILES.find((pf) => pf.filename === params.file)?.title ?? params.file;
      const trimmed = params.content.trim();
      const existing = sections.find((s) => s.title === title);
      if (existing) {
        existing.content = trimmed;
      } else if (trimmed) {
        sections.push({ title, content: trimmed });
      }

      return result(
        `Updated ${params.file}. Changes are live for this session and all future sessions.`,
        { action: "write", file: params.file, success: true }
      );
    },
  });

  // ─── Backward compat: keep "remember" as an alias for memory_store ────

  pi.registerTool({
    name: "remember",
    label: "Remember",
    description:
      "Quick shortcut to save a note to memory (equivalent to memory_store with category=core). " +
      "Use this when the user tells you something worth remembering for future conversations.",
    parameters: Type.Object({
      note: Type.String({
        description:
          'The thing to remember. Example: "User prefers TypeScript over JavaScript"',
      }),
    }),
    async execute(_toolCallId, params) {
      try {
        const db = getMemoryDb();
        // Auto-generate a key from the note (first few words, snake_cased)
        const key = params.note
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .split(/\s+/)
          .slice(0, 4)
          .join("_");

        db.store(key, params.note, "core");

        return {
          content: [{ type: "text", text: `Remembered: "${params.note}"` }],
          details: { key, note: params.note },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });
  }; // end personaExtension
} // end createPersonaExtension

// ─── Backward compatibility ───────────────────────────────────────────────────

/** Default export for backward compatibility (uses "default" persona) */
export default createPersonaExtension("default");

# @clankie/memory

Persistent memory for clankie using **TursoDB** with native vector search.

> **Note**
> While some `@clankie` extensions may work with a bare pi installation, they are crafted to be used with clankie (built on top of pi).

## Features

- **Native vector search** — Uses TursoDB's `F8_BLOB` for 75% storage savings and `vector_distance_cos()` for SQL-native similarity
- **Hybrid search** — Combines text matching with semantic vector search
- **Memory tracking** — Tracks retrieval count and last access for memory quality signals
- **Categories** — Supports `chunk`, `daily`, `longterm`, `correction`, `user_pref`
- **Pruning** — Clean up old unused memories automatically

## Tools

- `memory_search` — hybrid search across indexed memory content
- `memory_write` — append notes to daily memory or long-term memory

## Commands

- `/memory status` — show memory stats and categories
- `/memory reindex` — force full reindex of all files
- `/memory search <query>` — quick search from command line
- `/memory prune <days>` — remove unused memories older than N days

## Behavior

- Creates/uses `MEMORY.md` for long-term notes
- Creates/uses `memory/YYYY-MM-DD.md` for daily notes
- Watches memory files and keeps the index updated
- Injects recent memory snippets into agent context
- Tracks which memories are actually useful (retrieval count)

## Configuration

By default, uses **local CPU embeddings** with no API keys required:

```typescript
{
  "memory-config": {
    "enabled": true,
    "dbPath": "~/.clankie/memory.db",
    "embedding": {
      "provider": "local",  // Default! Runs on CPU, no API keys
      "model": "Xenova/all-MiniLM-L6-v2",
      "dimensions": 384
    },
    "search": {
      "vectorWeight": 0.7,
      "textWeight": 0.3,
      "maxResults": 10
    }
  }
}
```

### Alternative providers

```typescript
// OpenAI
"embedding": {
  "provider": "openai",
  "model": "text-embedding-3-small",
  "dimensions": 1536
}

// Ollama (local server)
"embedding": {
  "provider": "ollama",
  "model": "nomic-embed-text",
  "dimensions": 768
}

// Text-only (no embeddings)
"embedding": {
  "provider": null
}
```

## Package contents

- `src/` — TypeScript source
- `skills/` — Pi skills
- `package.json`
- `README.md`

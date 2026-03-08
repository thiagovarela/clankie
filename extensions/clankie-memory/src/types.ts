/**
 * Types and configuration for clankie-memory
 */

import { homedir } from "node:os";
import { join } from "node:path";

export interface EmbeddingConfig {
	/** Embedding provider. Omit or set to null for text-only search (no embeddings). */
	provider?: "openai" | "ollama" | "local" | null;
	/** Model name (for local: e.g. "Xenova/all-MiniLM-L6-v2") */
	model: string;
	apiKey?: string;
	baseUrl?: string;
	dimensions: number;
}

export interface SearchConfig {
	vectorWeight: number;
	textWeight: number;
	maxResults: number;
	candidateMultiplier: number;
	mmr: {
		enabled: boolean;
		lambda: number;
	};
	temporalDecay: {
		enabled: boolean;
		halfLifeDays: number;
	};
}

export interface MemoryConfig {
	enabled: boolean;
	dbPath: string;
	embedding: EmbeddingConfig;
	search: SearchConfig;
	chunkTargetTokens: number;
	chunkOverlapTokens: number;
	debounceMs: number;
}

export const DEFAULT_CONFIG: MemoryConfig = {
	enabled: true,
	dbPath: join(homedir(), ".clankie", "memory.db"),
	embedding: {
		// Local CPU embeddings by default (no API keys needed)
		provider: "local",
		model: "Xenova/all-MiniLM-L6-v2",
		dimensions: 384,
	},
	search: {
		vectorWeight: 0.7,
		textWeight: 0.3,
		maxResults: 10,
		candidateMultiplier: 4,
		mmr: {
			enabled: false,
			lambda: 0.5,
		},
		temporalDecay: {
			enabled: false,
			halfLifeDays: 30,
		},
	},
	chunkTargetTokens: 400,
	chunkOverlapTokens: 80,
	debounceMs: 1500,
};

/**
 * Memory record with TursoDB vector support
 * Uses quantized F8_BLOB embeddings for 75% storage savings
 */
export interface Memory {
	id: string;
	content: string;
	embedding?: number[] | Float64Array;
	filePath?: string;
	lineStart?: number;
	lineEnd?: number;
	/** Memory category: chunk, daily, longterm, correction, user_pref */
	category?: string;
	createdAt?: number;
	updatedAt?: number;
	lastRetrieved?: number;
	retrievalCount?: number;
	sourceTask?: string;
}

/**
 * Search result from memory store
 */
export interface MemorySearchResult {
	memory: Memory;
	score: number;
	vectorScore?: number;
	textScore?: number;
}

/**
 * Merge user config with defaults
 */
export function resolveConfig(userConfig?: Partial<MemoryConfig>): MemoryConfig {
	return {
		...DEFAULT_CONFIG,
		...userConfig,
		embedding: {
			...DEFAULT_CONFIG.embedding,
			...userConfig?.embedding,
		},
		search: {
			...DEFAULT_CONFIG.search,
			...userConfig?.search,
			mmr: {
				...DEFAULT_CONFIG.search.mmr,
				...userConfig?.search?.mmr,
			},
			temporalDecay: {
				...DEFAULT_CONFIG.search.temporalDecay,
				...userConfig?.search?.temporalDecay,
			},
		},
	};
}

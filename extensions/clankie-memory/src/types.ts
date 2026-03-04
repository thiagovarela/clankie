/**
 * Types and configuration for clankie-memory
 */

import { homedir } from "node:os";
import { join } from "node:path";

export interface EmbeddingConfig {
	provider: "openai" | "ollama";
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
	dbPath: join(homedir(), ".clankie", "memory.sqlite"),
	embedding: {
		provider: "openai",
		model: "text-embedding-3-small",
		dimensions: 1536,
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

export interface Chunk {
	id: string;
	filePath: string;
	lineStart: number;
	lineEnd: number;
	content: string;
	embedding?: Float64Array;
	createdAt: string;
	updatedAt: string;
}

export interface SearchResult {
	chunk: Chunk;
	score: number;
	vectorScore?: number;
	textScore?: number;
}

export interface FileHash {
	filePath: string;
	hash: string;
	updatedAt: string;
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

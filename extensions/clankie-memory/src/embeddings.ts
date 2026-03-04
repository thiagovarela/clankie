/**
 * Embedding provider for clankie-memory
 * Supports OpenAI-compatible APIs including OpenAI, Ollama, and custom endpoints
 */

import { createHash } from "node:crypto";
import type { EmbeddingConfig } from "./types.ts";

export interface EmbeddingProvider {
	embed(texts: string[]): Promise<number[][]>;
}

interface CacheEntry {
	embedding: number[];
	timestamp: number;
}

// Simple LRU cache for embeddings
class EmbeddingCache {
	private cache = new Map<string, CacheEntry>();
	private maxSize: number;

	constructor(maxSize = 1000) {
		this.maxSize = maxSize;
	}

	private getHash(text: string): string {
		return createHash("sha256").update(text).digest("hex");
	}

	get(text: string): number[] | undefined {
		const hash = this.getHash(text);
		const entry = this.cache.get(hash);
		if (entry) {
			// Move to front (LRU)
			this.cache.delete(hash);
			this.cache.set(hash, entry);
			return entry.embedding;
		}
		return undefined;
	}

	set(text: string, embedding: number[]): void {
		const hash = this.getHash(text);

		// Evict oldest if at capacity
		if (this.cache.size >= this.maxSize && !this.cache.has(hash)) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}

		this.cache.set(hash, { embedding, timestamp: Date.now() });
	}

	clear(): void {
		this.cache.clear();
	}
}

// Global cache instance
const globalCache = new EmbeddingCache(2000);

/**
 * Create an embedding provider from config
 */
export function createEmbeddingProvider(
	config: EmbeddingConfig,
	getApiKey?: (provider: string) => string | undefined,
): EmbeddingProvider {
	return {
		async embed(texts: string[]): Promise<number[][]> {
			// Check cache first
			const results: (number[] | undefined)[] = texts.map((t) => globalCache.get(t));
			const uncachedIndices: number[] = [];
			const uncachedTexts: string[] = [];

			for (let i = 0; i < texts.length; i++) {
				if (results[i] === undefined) {
					uncachedIndices.push(i);
					uncachedTexts.push(texts[i]);
				}
			}

			// Fetch uncached embeddings
			if (uncachedTexts.length > 0) {
				const embeddings = await fetchEmbeddings(uncachedTexts, config, getApiKey);

				// Store in cache and fill results
				for (let i = 0; i < uncachedIndices.length; i++) {
					const idx = uncachedIndices[i];
					const embedding = embeddings[i];
					globalCache.set(texts[idx], embedding);
					results[idx] = embedding;
				}
			}

			return results as number[][];
		},
	};
}

/**
 * Fetch embeddings from API with retry
 */
async function fetchEmbeddings(
	texts: string[],
	config: EmbeddingConfig,
	getApiKey?: (provider: string) => string | undefined,
): Promise<number[][]> {
	const baseUrl = config.baseUrl ?? getDefaultBaseUrl(config.provider);
	const apiKey = resolveApiKey(config, getApiKey);

	const url = `${baseUrl}/v1/embeddings`;
	const body = {
		model: config.model,
		input: texts,
	};

	let lastError: Error | undefined;

	// Try up to 2 times
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Embedding API error: ${response.status} ${errorText}`);
			}

			const data = await response.json();

			// Handle different response formats
			if (data.data && Array.isArray(data.data)) {
				// OpenAI format
				return data.data
					.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
					.map((item: { embedding: number[] }) => item.embedding);
			} else if (Array.isArray(data.embeddings)) {
				// Alternative format
				return data.embeddings;
			} else if (Array.isArray(data)) {
				// Direct array
				return data;
			}

			throw new Error("Unexpected embedding API response format");
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Wait before retry (exponential backoff)
			if (attempt === 0) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	}

	throw lastError ?? new Error("Failed to fetch embeddings");
}

function getDefaultBaseUrl(provider: string): string {
	switch (provider) {
		case "openai":
			return "https://api.openai.com";
		case "ollama":
			return "http://localhost:11434";
		default:
			return "https://api.openai.com";
	}
}

function resolveApiKey(
	config: EmbeddingConfig,
	getApiKey?: (provider: string) => string | undefined,
): string | undefined {
	// 1. Config literal
	if (config.apiKey && !config.apiKey.startsWith("$")) {
		return config.apiKey;
	}

	// 2. Environment variable reference ($ENV_VAR)
	if (config.apiKey?.startsWith("$")) {
		const envVar = config.apiKey.substring(1);
		return process.env[envVar];
	}

	// 3. From pi's model registry
	if (getApiKey) {
		return getApiKey(config.provider);
	}

	// 4. Default env vars
	if (config.provider === "openai") {
		return process.env.OPENAI_API_KEY;
	}

	return undefined;
}

/**
 * Clear the global embedding cache
 */
export function clearEmbeddingCache(): void {
	globalCache.clear();
}

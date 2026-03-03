import { createHash } from "node:crypto";
import type { MemoryConfig } from "./types.ts";

export interface EmbeddingProvider {
	embed(texts: string[]): Promise<number[][]>;
	providerName: string;
}

interface CacheEntry {
	value: number[];
	timestamp: number;
}

class LruCache {
	private readonly maxEntries: number;
	private readonly map = new Map<string, CacheEntry>();

	constructor(maxEntries: number) {
		this.maxEntries = maxEntries;
	}

	get(key: string): number[] | undefined {
		const entry = this.map.get(key);
		if (!entry) return undefined;
		this.map.delete(key);
		this.map.set(key, entry);
		return entry.value;
	}

	set(key: string, value: number[]): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		}
		this.map.set(key, { value, timestamp: Date.now() });
		if (this.map.size > this.maxEntries) {
			const oldest = this.map.keys().next().value;
			if (oldest) {
				this.map.delete(oldest);
			}
		}
	}
}

const sharedCache = new LruCache(1000);

function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function resolveApiKey(config: MemoryConfig): string | undefined {
	const configured = config.embedding.apiKey?.trim();
	if (!configured) return process.env.OPENAI_API_KEY;

	if (configured.startsWith("env:")) {
		return process.env[configured.slice(4)];
	}
	if (process.env[configured]) {
		return process.env[configured];
	}
	return configured;
}

async function fetchEmbeddings(
	url: string,
	payload: Record<string, unknown>,
	headers: Record<string, string>,
): Promise<number[][]> {
	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
	}

	const json = (await response.json()) as {
		data?: Array<{ embedding?: number[] }>;
	};
	if (!json.data) return [];
	return json.data.map((item) => item.embedding ?? []);
}

export function createEmbeddingProvider(config: MemoryConfig): EmbeddingProvider {
	const baseUrl = (config.embedding.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
	const endpoint = `${baseUrl}/v1/embeddings`;
	const providerName = `${config.embedding.provider}:${config.embedding.model}`;

	return {
		providerName,
		async embed(texts: string[]): Promise<number[][]> {
			if (texts.length === 0) return [];

			const results: number[][] = new Array(texts.length);
			const misses: { index: number; text: string; hash: string }[] = [];

			for (let i = 0; i < texts.length; i += 1) {
				const text = texts[i];
				const hash = hashText(text);
				const cached = sharedCache.get(hash);
				if (cached) {
					results[i] = cached;
				} else {
					misses.push({ index: i, text, hash });
				}
			}

			if (misses.length === 0) return results;

			const apiKey = resolveApiKey(config);
			if (!apiKey) {
				return [];
			}

			const headers: Record<string, string> = {
				"content-type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			};

			const payload: Record<string, unknown> = {
				model: config.embedding.model,
				input: misses.map((item) => item.text),
			};
			if (config.embedding.dimensions > 0) {
				payload.dimensions = config.embedding.dimensions;
			}

			for (let attempt = 0; attempt < 2; attempt += 1) {
				try {
					const vectors = await fetchEmbeddings(endpoint, payload, headers);
					for (let i = 0; i < misses.length; i += 1) {
						const vector = vectors[i] ?? [];
						const miss = misses[i];
						results[miss.index] = vector;
						if (vector.length > 0) {
							sharedCache.set(miss.hash, vector);
						}
					}
					return results;
				} catch (error) {
					if (attempt === 1) {
						console.warn(
							`[clankie-memory] Embedding fetch failed: ${error instanceof Error ? error.message : String(error)}`,
						);
						return [];
					}
					await new Promise((resolve) => setTimeout(resolve, 350));
				}
			}

			return [];
		},
	};
}

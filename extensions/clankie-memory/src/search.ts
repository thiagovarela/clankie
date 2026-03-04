/**
 * Hybrid search engine for clankie-memory
 * Combines BM25 (FTS5) + vector cosine similarity with optional MMR and temporal decay
 */

import type { EmbeddingProvider } from "./embeddings.ts";
import type { MemoryStore } from "./store.ts";
import type { Chunk, MemoryConfig, SearchResult } from "./types.ts";

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculate Jaccard similarity between two texts (for MMR diversity)
 */
function jaccardSimilarity(textA: string, textB: string): number {
	const tokensA = new Set(textA.toLowerCase().split(/\s+/));
	const tokensB = new Set(textB.toLowerCase().split(/\s+/));

	const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
	const union = new Set([...tokensA, ...tokensB]);

	if (union.size === 0) return 0;
	return intersection.size / union.size;
}

/**
 * Extract date from filename (YYYY-MM-DD pattern)
 */
function extractDateFromFilename(filePath: string): Date | null {
	const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
	if (match) {
		const date = new Date(match[1]);
		if (!Number.isNaN(date.getTime())) {
			return date;
		}
	}
	return null;
}

/**
 * Check if file is an evergreen file (not subject to temporal decay)
 */
function isEvergreen(filePath: string): boolean {
	// MEMORY.md and files without dates are evergreen
	if (filePath.endsWith("MEMORY.md")) return true;
	if (!extractDateFromFilename(filePath)) return true;
	return false;
}

/**
 * Apply temporal decay to score
 */
function applyTemporalDecay(score: number, filePath: string, halfLifeDays: number): number {
	if (isEvergreen(filePath)) return score;

	const fileDate = extractDateFromFilename(filePath);
	if (!fileDate) return score;

	const now = new Date();
	const ageInDays = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
	const lambda = Math.log(2) / halfLifeDays;
	const decayFactor = Math.exp(-lambda * ageInDays);

	return score * decayFactor;
}

/**
 * Perform MMR (Maximal Marginal Relevance) re-ranking
 */
function mmrRerank(results: SearchResult[], lambda: number, maxResults: number): SearchResult[] {
	if (results.length <= maxResults) return results;

	const selected: SearchResult[] = [];
	const remaining = [...results];

	while (selected.length < maxResults && remaining.length > 0) {
		let bestIdx = 0;
		let bestScore = -Infinity;

		for (let i = 0; i < remaining.length; i++) {
			const result = remaining[i];

			// Calculate similarity to already selected items
			let maxSim = 0;
			for (const selectedResult of selected) {
				const sim = jaccardSimilarity(result.chunk.content, selectedResult.chunk.content);
				maxSim = Math.max(maxSim, sim);
			}

			// MMR score: lambda * relevance - (1 - lambda) * max_similarity
			const mmrScore = lambda * result.score - (1 - lambda) * maxSim;

			if (mmrScore > bestScore) {
				bestScore = mmrScore;
				bestIdx = i;
			}
		}

		selected.push(remaining[bestIdx]);
		remaining.splice(bestIdx, 1);
	}

	return selected;
}

/**
 * Search engine that performs hybrid search
 */
export class SearchEngine {
	private config: MemoryConfig;
	private store: MemoryStore;
	private embeddingProvider: EmbeddingProvider;

	constructor(config: MemoryConfig, store: MemoryStore, embeddingProvider: EmbeddingProvider) {
		this.config = config;
		this.store = store;
		this.embeddingProvider = embeddingProvider;
	}

	/**
	 * Perform hybrid search
	 */
	async search(query: string, maxResults?: number): Promise<SearchResult[]> {
		const limit = maxResults ?? this.config.search.maxResults;
		const candidateMultiplier = this.config.search.candidateMultiplier;
		const candidateLimit = limit * candidateMultiplier;

		// Get candidates from FTS5
		const textCandidates = this.store.searchFTS(query, candidateLimit);

		// Get candidates from vector search
		let vectorCandidates: Chunk[] = [];
		try {
			vectorCandidates = await this.vectorSearch(query, candidateLimit);
		} catch (error) {
			console.warn("[memory] Vector search failed, falling back to FTS only:", error);
		}

		// Merge candidates and calculate hybrid scores
		const candidateMap = new Map<string, SearchResult>();

		// Add text candidates
		for (let i = 0; i < textCandidates.length; i++) {
			const chunk = textCandidates[i];
			// BM25 rank starts at 1, lower is better
			// Convert to score between 0 and 1
			const textScore = 1 / (1 + i);

			candidateMap.set(chunk.id, {
				chunk,
				score: textScore * this.config.search.textWeight,
				textScore,
			});
		}

		// Add/merge vector candidates
		for (const chunk of vectorCandidates) {
			const existing = candidateMap.get(chunk.id);
			if (existing && chunk.embedding) {
				// This shouldn't happen as FTS doesn't return embeddings
				// But just in case, merge the scores
				const vectorScore = 1; // Already normalized in vectorSearch
				existing.score += vectorScore * this.config.search.vectorWeight;
				existing.vectorScore = vectorScore;
			} else if (chunk.embedding) {
				// Get the actual similarity score for this chunk
				// We need to query embedding for comparison
				const [queryEmbedding] = await this.embeddingProvider.embed([query]);
				const vectorScore = cosineSimilarity(new Float64Array(queryEmbedding), chunk.embedding);

				candidateMap.set(chunk.id, {
					chunk,
					score: vectorScore * this.config.search.vectorWeight,
					vectorScore,
				});
			}
		}

		// Convert to array and sort by score
		let results = Array.from(candidateMap.values());

		// Apply temporal decay if enabled
		if (this.config.search.temporalDecay.enabled) {
			results = results.map((r) => ({
				...r,
				score: applyTemporalDecay(r.score, r.chunk.filePath, this.config.search.temporalDecay.halfLifeDays),
			}));
		}

		// Sort by score descending
		results.sort((a, b) => b.score - a.score);

		// Apply MMR if enabled
		if (this.config.search.mmr.enabled) {
			results = mmrRerank(results, this.config.search.mmr.lambda, limit);
		} else {
			results = results.slice(0, limit);
		}

		return results;
	}

	/**
	 * Perform vector-only search (for hybrid fallback)
	 */
	async vectorSearch(query: string, limit: number): Promise<Chunk[]> {
		// Get query embedding
		const [queryEmbedding] = await this.embeddingProvider.embed([query]);
		const queryVector = new Float64Array(queryEmbedding);

		// Get all chunks with embeddings from database
		const chunks = this.store.getAllChunksWithEmbeddings();

		// Calculate similarities
		const scored = chunks
			.filter((chunk): chunk is typeof chunk & { embedding: Float64Array } => chunk.embedding !== undefined)
			.map((chunk) => ({
				chunk,
				score: cosineSimilarity(queryVector, chunk.embedding),
			}));

		// Sort by similarity descending
		scored.sort((a, b) => b.score - a.score);

		// Return top N
		return scored.slice(0, limit).map((s) => s.chunk);
	}

	/**
	 * Search with FTS5 only (fallback when embeddings unavailable)
	 */
	searchFTSOnly(query: string, maxResults?: number): SearchResult[] {
		const limit = maxResults ?? this.config.search.maxResults;
		const chunks = this.store.searchFTS(query, limit);

		return chunks.map((chunk, i) => ({
			chunk,
			score: 1 / (1 + i),
			textScore: 1 / (1 + i),
		}));
	}
}

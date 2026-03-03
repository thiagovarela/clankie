import type { EmbeddingProvider } from "./embeddings.ts";
import type { FtsSearchResult, MemoryStore, VectorSearchResult } from "./store.ts";
import type { MemoryConfig, MemorySearchResult } from "./types.ts";

function normalizeTextScore(rank: number): number {
	return 1 / (1 + Math.max(0, rank));
}

function normalizeVectorScore(score: number): number {
	return (score + 1) / 2;
}

function dateFromFilePath(filePath: string): Date | null {
	const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
	if (!match) return null;
	const date = new Date(`${match[1]}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

function applyTemporalDecay(score: number, filePath: string, config: MemoryConfig): number {
	if (!config.search.temporalDecay.enabled) return score;
	if (filePath === "MEMORY.md") return score;

	const date = dateFromFilePath(filePath);
	if (!date) return score;

	const now = Date.now();
	const ageDays = Math.max(0, (now - date.getTime()) / (1000 * 60 * 60 * 24));
	const lambda = Math.log(2) / Math.max(1, config.search.temporalDecay.halfLifeDays);
	return score * Math.exp(-lambda * ageDays);
}

function jaccard(a: string, b: string): number {
	const tokenize = (text: string) => new Set(text.toLowerCase().split(/\W+/).filter(Boolean));
	const sa = tokenize(a);
	const sb = tokenize(b);
	if (sa.size === 0 || sb.size === 0) return 0;
	let intersection = 0;
	for (const token of sa) {
		if (sb.has(token)) intersection += 1;
	}
	const union = sa.size + sb.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

function applyMmr(items: MemorySearchResult[], lambda: number, k: number): MemorySearchResult[] {
	if (items.length <= 1) return items.slice(0, k);
	const selected: MemorySearchResult[] = [];
	const candidates = [...items];

	while (selected.length < k && candidates.length > 0) {
		let bestIndex = 0;
		let bestScore = Number.NEGATIVE_INFINITY;
		for (let i = 0; i < candidates.length; i += 1) {
			const candidate = candidates[i];
			let redundancy = 0;
			for (const chosen of selected) {
				redundancy = Math.max(redundancy, jaccard(candidate.snippet, chosen.snippet));
			}
			const mmrScore = lambda * candidate.score - (1 - lambda) * redundancy;
			if (mmrScore > bestScore) {
				bestScore = mmrScore;
				bestIndex = i;
			}
		}
		selected.push(candidates.splice(bestIndex, 1)[0]);
	}

	return selected;
}

export async function hybridSearch(
	store: MemoryStore,
	embeddingProvider: EmbeddingProvider,
	config: MemoryConfig,
	query: string,
	maxResults?: number,
): Promise<MemorySearchResult[]> {
	const requested = Math.max(1, maxResults ?? config.search.maxResults);
	const candidateLimit = Math.max(requested, requested * config.search.candidateMultiplier);

	const textCandidates: FtsSearchResult[] = store.searchFTS(query, candidateLimit);
	const queryEmbeddings = await embeddingProvider.embed([query]);
	const vectorCandidates: VectorSearchResult[] = queryEmbeddings[0]
		? store.searchVector(queryEmbeddings[0], candidateLimit)
		: [];

	const merged = new Map<string, MemorySearchResult>();

	for (const candidate of textCandidates) {
		const textScore = normalizeTextScore(candidate.rank);
		const current = merged.get(candidate.id);
		merged.set(candidate.id, {
			id: candidate.id,
			snippet: candidate.content,
			filePath: candidate.filePath,
			lineStart: candidate.lineStart,
			lineEnd: candidate.lineEnd,
			textScore,
			vectorScore: current?.vectorScore ?? 0,
			score: 0,
		});
	}

	for (const candidate of vectorCandidates) {
		const vectorScore = normalizeVectorScore(candidate.score);
		const current = merged.get(candidate.id);
		merged.set(candidate.id, {
			id: candidate.id,
			snippet: candidate.content,
			filePath: candidate.filePath,
			lineStart: candidate.lineStart,
			lineEnd: candidate.lineEnd,
			textScore: current?.textScore ?? 0,
			vectorScore,
			score: 0,
		});
	}

	const scored = Array.from(merged.values()).map((item) => {
		const vectorWeight = vectorCandidates.length > 0 ? config.search.vectorWeight : 0;
		const textWeight = vectorCandidates.length > 0 ? config.search.textWeight : 1;
		const raw = vectorWeight * item.vectorScore + textWeight * item.textScore;
		const decayed = applyTemporalDecay(raw, item.filePath, config);
		return { ...item, score: decayed };
	});

	const ranked = scored.sort((a, b) => b.score - a.score);
	if (config.search.mmr.enabled) {
		return applyMmr(ranked, config.search.mmr.lambda, requested);
	}
	return ranked.slice(0, requested);
}

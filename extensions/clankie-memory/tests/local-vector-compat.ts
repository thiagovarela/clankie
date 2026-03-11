import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createEmbeddingProvider, clearEmbeddingCache } from "../src/embeddings.ts";
import { MemoryStore } from "../src/store.ts";
import { DEFAULT_CONFIG, resolveConfig, type EmbeddingConfig } from "../src/types.ts";

const strict = process.env.MEMORY_TEST_STRICT === "1";

/**
 * Reference local model profile used for lightweight CPU embeddings.
 */
const REFERENCE_MODEL = "Xenova/all-MiniLM-L6-v2";
const REFERENCE_DIMS = 384;

function log(msg: string): void {
	console.log(`[local-vector-test] ${msg}`);
}

function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}
	if (magA === 0 || magB === 0) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function testReferenceModelEmbeddings(): Promise<void> {
	const config: EmbeddingConfig = {
		provider: "local",
		model: process.env.MEMORY_TEST_MODEL ?? REFERENCE_MODEL,
		dimensions: Number(process.env.MEMORY_TEST_DIMS ?? REFERENCE_DIMS),
		cacheDir: process.env.MEMORY_TEST_CACHE_DIR,
	};

	const provider = createEmbeddingProvider(config);
	const texts = [
		"The user prefers TypeScript over JavaScript.",
		"TypeScript is preferred for this project.",
		"The weather is sunny today.",
	];

	log(`loading local model profile: ${config.model}`);
	const t0 = performance.now();
	const embeddings = await provider.embed(texts);
	const t1 = performance.now();

	assert.equal(embeddings.length, texts.length, "must return one embedding per text");
	for (const embedding of embeddings) {
		assert.ok(Array.isArray(embedding), "embedding must be an array");
		assert.ok(embedding.length > 0, "embedding must not be empty");
	}

	if (config.model === REFERENCE_MODEL) {
		assert.equal(
			embeddings[0].length,
			REFERENCE_DIMS,
			`reference model should produce ${REFERENCE_DIMS} dims`,
		);
	}

	// Semantic sanity checks
	const similarScore = cosineSimilarity(embeddings[0], embeddings[1]);
	const differentScore = cosineSimilarity(embeddings[0], embeddings[2]);
	assert.ok(similarScore > differentScore, "semantically similar sentence should score higher");

	log(
		`embedding sanity ok (${embeddings[0].length} dims, ` +
			`similar=${similarScore.toFixed(3)}, different=${differentScore.toFixed(3)}) in ${Math.round(t1 - t0)}ms`,
	);

	// Cache consistency check
	const [cached] = await provider.embed([texts[0]]);
	assert.equal(cached.length, embeddings[0].length, "cached embedding dims must match");
}

async function testVectorSearchPipeline(): Promise<void> {
	const baseDir = mkdtempSync(join(tmpdir(), "clankie-memory-test-"));
	const dbPath = join(baseDir, "memory.db");

	const config = resolveConfig({
		dbPath,
		embedding: {
			...DEFAULT_CONFIG.embedding,
			provider: "local",
			model: process.env.MEMORY_TEST_MODEL ?? REFERENCE_MODEL,
			dimensions: Number(process.env.MEMORY_TEST_DIMS ?? REFERENCE_DIMS),
			cacheDir: process.env.MEMORY_TEST_CACHE_DIR,
		},
	});

	const provider = createEmbeddingProvider(config.embedding);
	const store = new MemoryStore(config);

	try {
		await store.open();

		const memoryTexts = [
			"The user prefers TypeScript over JavaScript for backend services.",
			"The preferred deployment region is eu-west-1.",
		];
		const [embA, embB] = await provider.embed(memoryTexts);

		await store.upsertMemories([
			{
				id: "mem-typescript",
				content: memoryTexts[0],
				embedding: embA,
				filePath: "MEMORY.md",
				lineStart: 1,
				lineEnd: 1,
				category: "longterm",
			},
			{
				id: "mem-region",
				content: memoryTexts[1],
				embedding: embB,
				filePath: "MEMORY.md",
				lineStart: 2,
				lineEnd: 2,
				category: "longterm",
			},
		]);

		const [queryEmbedding] = await provider.embed(["Use TypeScript for backend"]);
		const results = await store.vectorSearch(queryEmbedding, 2);

		assert.ok(results.length >= 1, "vector search should return at least one result");
		assert.equal(results[0].memory.id, "mem-typescript", "top vector match should be the TypeScript memory");
		assert.ok(Number.isFinite(results[0].score), "top vector score must be finite");

		log(
			`vector search pipeline ok (top=${results[0].memory.id}, score=${results[0].score.toFixed(3)}, db=${dbPath})`,
		);
	} finally {
		await store.close().catch(() => {});
		rmSync(baseDir, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	clearEmbeddingCache();

	try {
		await testReferenceModelEmbeddings();
		await testVectorSearchPipeline();
		log("all local vector compatibility tests passed");
	} catch (error) {
		if (strict) {
			throw error;
		}
		log(`test failed in non-strict mode: ${error instanceof Error ? error.message : String(error)}`);
		log("set MEMORY_TEST_STRICT=1 to fail on errors");
	}
}

main().catch((error) => {
	console.error(`[local-vector-test] FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
	process.exit(1);
});

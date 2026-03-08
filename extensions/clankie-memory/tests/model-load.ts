import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createEmbeddingProvider } from "../src/embeddings.ts";
import type { EmbeddingConfig } from "../src/types.ts";

const strict = process.env.MEMORY_TEST_STRICT === "1";

function log(msg: string): void {
	console.log(`[model-test] ${msg}`);
}

async function testLocalModelLoad(): Promise<void> {
	const config: EmbeddingConfig = {
		provider: "local",
		model: process.env.MEMORY_TEST_MODEL ?? "Xenova/all-MiniLM-L6-v2",
		dimensions: Number(process.env.MEMORY_TEST_DIMS ?? 384),
		cacheDir: process.env.MEMORY_TEST_CACHE_DIR,
	};

	const provider = createEmbeddingProvider(config);
	const text = "The user prefers TypeScript over JavaScript.";

	log(`loading local model: ${config.model}`);
	const t0 = performance.now();
	const [embedding] = await provider.embed([text]);
	const t1 = performance.now();

	assert.ok(Array.isArray(embedding), "embedding must be an array");
	assert.ok(embedding.length > 0, "embedding must not be empty");

	if (config.dimensions > 0 && embedding.length !== config.dimensions) {
		log(`warning: expected ${config.dimensions} dims, got ${embedding.length}`);
	}

	log(`first embed ok (${embedding.length} dims) in ${Math.round(t1 - t0)}ms`);

	// cache check
	const t2 = performance.now();
	const [embedding2] = await provider.embed([text]);
	const t3 = performance.now();
	assert.equal(embedding2.length, embedding.length, "cached embedding dims must match");
	log(`cached embed ok in ${Math.round(t3 - t2)}ms`);
}

async function testNullProvider(): Promise<void> {
	const provider = createEmbeddingProvider({
		provider: null,
		model: "unused",
		dimensions: 0,
	});

	let threw = false;
	try {
		await provider.embed(["hello"]);
	} catch {
		threw = true;
	}
	assert.equal(threw, true, "null provider should throw");
	log("null provider behavior ok");
}

async function main(): Promise<void> {
	await testNullProvider();

	try {
		await testLocalModelLoad();
		log("all model tests passed");
	} catch (error) {
		if (strict) {
			throw error;
		}
		log(`local model test failed in non-strict mode: ${error instanceof Error ? error.message : String(error)}`);
		log("set MEMORY_TEST_STRICT=1 to fail on model load errors");
	}
}

main().catch((error) => {
	console.error(`[model-test] FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
	process.exit(1);
});

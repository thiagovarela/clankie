#!/usr/bin/env node
import * as esbuild from "esbuild";
import { chmodSync } from "node:fs";

// Create a shim for dynamic require
const requireShim = `
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname$1 } from 'path';

const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname$1(__filename);
const require = __createRequire(import.meta.url);
`;

await esbuild.build({
	entryPoints: ["src/cli.ts"],
	bundle: true,
	outfile: "dist/cli.js",
	platform: "node",
	format: "esm",
	target: "node24",
	external: ["koffi", "@silvia-odwyer/photon-node", "@mariozechner/clipboard"],
	banner: {
		js: requireShim,
	},
	inject: [],
});

chmodSync("dist/cli.js", 0o755);
console.log("✓ Built dist/cli.js");

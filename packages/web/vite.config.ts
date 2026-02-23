import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "dist/client",
		emptyOutDir: true,
		commonjsOptions: {
			transformMixedEsModules: true,
		},
		rollupOptions: {
			// Mark Node.js-only packages as external - they won't be bundled
			// pi-web-ui imports these transitively but doesn't use them in browser context
			external: [
				/@smithy\//,
				/undici/,
				/basic-ftp/,
				/@aws-sdk\//,
				/ollama/,
				/@lmstudio\/sdk/,
			],
		},
	},
	server: {
		port: 5173,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:3333",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://127.0.0.1:3333",
				ws: true,
			},
		},
	},
});

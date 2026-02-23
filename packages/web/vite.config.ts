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

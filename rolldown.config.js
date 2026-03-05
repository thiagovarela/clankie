import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/cli.ts",
  output: {
    dir: "dist",
    entryFileNames: "cli.js",
    format: "esm",
    codeSplitting: false,
  },
  external: ["koffi", "@silvia-odwyer/photon-node", "@mariozechner/clipboard"],
  platform: "node",
  target: "node24",
});

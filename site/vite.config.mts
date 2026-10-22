import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(siteRoot, "..");

export default defineConfig(({ command }) => ({
  root: siteRoot,
  // Project site on GitHub Pages is served from /NexusFit/
  base: command === "build" ? "/NexusFit/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(repoRoot, "src"),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [repoRoot],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));

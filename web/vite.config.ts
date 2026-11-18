import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Every build carries an id: the commit it was built from on GitHub, the build time elsewhere. The page knows its
// own id (__BUILD_ID__) and version.json beside it names the newest one, so an open page can tell that a newer
// version has been published and offer to load it (src/lib/update.ts).
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const BUILD_ID = env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 12) : `b${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const versionFile = (): Plugin => ({
  name: "om-version",
  apply: "build",
  generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID, at: new Date().toISOString() }) + "\n" }); },
});

// Served from GitHub Pages under /orrery-market-monitor/. Hash routing keeps every tab on one URL.
export default defineConfig({
  base: "/orrery-market-monitor/",
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { sourcemap: false, target: "es2022" },
});

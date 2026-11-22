import { readFileSync } from "node:fs";
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

// The page's switch for the paper portfolio is one constant, PAPER_ON_LIVE_SITE in src/lib/paper.ts (README.md, "The
// paper portfolio's two switches"). It is read here as text and handed to the page as __PAPER_BUILD__: true on every
// development server, the constant's value in a build. With it false the build leaves the portfolio's screens out
// altogether: their file is asked for behind `__PAPER_BUILD__ ? … : null`, which a build then drops.
const PAPER_ON_LIVE_SITE = /^export const PAPER_ON_LIVE_SITE = true;/m.test(readFileSync(new URL("./src/lib/paper.ts", import.meta.url), "utf8"));

// Served from GitHub Pages under /orrery-market-monitor/. Hash routing keeps every tab on one URL.
export default defineConfig(({ command }) => ({
  base: "/orrery-market-monitor/",
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __PAPER_BUILD__: JSON.stringify(command === "serve" || PAPER_ON_LIVE_SITE) },
  build: { sourcemap: false, target: "es2022" },
}));

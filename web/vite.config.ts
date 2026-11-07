import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages under /orrery-market-monitor/. Hash routing keeps every tab on one URL.
export default defineConfig({
  base: "/orrery-market-monitor/",
  plugins: [react()],
  build: { sourcemap: false, target: "es2022" },
});

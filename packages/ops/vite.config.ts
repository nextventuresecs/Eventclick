/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Ops Console frontend. Built into dist/ and served by ops-server behind
 * requireMaintainer; never deployed to the public client container.
 *
 * No source maps in the build: the bundle is served only to maintainers, but
 * nothing here uploads maps anywhere, so emitting them would only publish
 * readable source.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@application/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  envDir: path.resolve(__dirname, "../.."),
  build: {
    sourcemap: false,
    // ops-server's CSP has no 'unsafe-inline'; keep every asset a file.
    assetsInlineLimit: 0,
  },
  server: {
    host: "127.0.0.1",
    port: 3100,
    strictPort: true,
    proxy: {
      "/ops-api": { target: process.env.OPS_API_PROXY_TARGET || "http://localhost:4100", changeOrigin: false },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

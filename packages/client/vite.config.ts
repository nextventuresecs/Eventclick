/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Off by default: it runs a service worker in front of the /api proxy during
      // normal development. Set VITE_PWA_DEV=true to test the install flow locally —
      // without it there's no manifest or SW under `npm run dev`, so
      // `beforeinstallprompt` never fires and install always looks unsupported.
      devOptions: { enabled: process.env.VITE_PWA_DEV === "true" },
      includeAssets: [
        "favicon.svg",
        "Android/playstore-icon.png",
        "only_icon.png",
        "iOS/Icon-60@3x.png",
        "iOS/Icon-76@2x.png",
      ],
      manifest: {
        name: "Eventclick",
        short_name: "Eventclick",
        description: "Event Management SaaS",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/Android/playstore-icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/only_icon.png",
            sizes: "192x192",
            type: "image/png"
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      plugins: [
        visualizer({
          open: false,
          gzipSize: true,
          brotliSize: true,
          filename: "dist/stats.html",
        }),
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@application/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  envDir: path.resolve(__dirname, "../.."),
  optimizeDeps: {
    include: ["@application/shared"],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.PLAYWRIGHT_API_BASE_URL || process.env.VITE_API_URL,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules"],
    css: true,
  },
});

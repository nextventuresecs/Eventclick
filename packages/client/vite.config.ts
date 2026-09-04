/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import { sentryVitePlugin } from "@sentry/vite-plugin";

/**
 * Source-map upload is opt-in on the presence of BOTH secrets, and silently
 * absent otherwise — local builds, forks and PR builds have neither and must
 * not fail for it.
 *
 * The release name is the load-bearing part. Sentry matches uploaded maps to
 * an event by release string, so this must be byte-identical to the
 * VITE_SENTRY_RELEASE the browser reports at runtime (see src/lib/sentry.ts).
 * Let the plugin default the name instead and it invents one from git; the
 * upload then succeeds, Sentry reports no error, and every stack trace stays
 * minified — the failure gives you nothing to notice. So a token without a
 * release is treated as a misconfiguration and fails the build rather than
 * producing a green build that quietly achieves nothing.
 */
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryRelease = process.env.VITE_SENTRY_RELEASE;

if (sentryAuthToken && !sentryRelease) {
  throw new Error(
    "SENTRY_AUTH_TOKEN is set but VITE_SENTRY_RELEASE is not. Source maps would upload " +
      "under a release the runtime never reports, leaving stack traces minified. " +
      "Pass both, or neither.",
  );
}

const uploadSourceMaps = Boolean(sentryAuthToken && sentryRelease);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest (not the default generateSW) so src/sw.ts can add its
      // own push / notificationclick handlers alongside Workbox precaching —
      // generateSW only lets you configure precaching, not add custom
      // listeners to the generated service worker.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // Web push payloads and their icons are small; no need to precache
        // them and workbox-build would otherwise choke on non-precache assets.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
      // Off by default: it runs a service worker in front of the /api proxy during
      // normal development. Set VITE_PWA_DEV=true to test the install flow locally —
      // without it there's no manifest or SW under `npm run dev`, so
      // `beforeinstallprompt` never fires and install always looks unsupported.
      devOptions: { enabled: process.env.VITE_PWA_DEV === "true", type: "module" },
      includeAssets: [
        "favicon.svg",
        "Android/playstore-icon.png",
        "only_icon.png",
        "iOS/Icon-60@3x.png",
        "iOS/Icon-76@2x.png",
      ],
      manifest: {
        name: "EventClick",
        short_name: "EventClick",
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
    }),
    // Must come last: it reads the bundle the other plugins have finished
    // producing. Emits nothing when the secrets are absent.
    ...(uploadSourceMaps
      ? [
          sentryVitePlugin({
            org: "eventclick",
            project: "eventclick-client",
            authToken: sentryAuthToken,
            release: { name: sentryRelease },
            telemetry: false,
            sourcemaps: {
              // First line of defence only. The Dockerfile deletes maps
              // unconditionally after the build, because this runs after a
              // *successful* upload and the errorHandler below deliberately
              // lets a failed one through.
              filesToDeleteAfterUpload: ["./dist/**/*.map"],
            },
            /**
             * A failed upload must not fail the build. Sentry being
             * unreachable, rate-limiting, or holding an expired token would
             * otherwise block a production deploy over an observability
             * artefact — blocking a fix from shipping is far worse than
             * shipping it with minified traces. Logged at error level so a
             * persistently broken token is still visible in the build output
             * rather than degrading silently.
             */
            errorHandler: (err) => {
              console.error("[sentry] source map upload failed; continuing build.", err.message);
            },
          }),
        ]
      : []),
  ],
  build: {
    // "hidden" — generate maps for the upload, but omit the
    // `//# sourceMappingURL=` comment from the emitted JS. Plain `true` leaves
    // that comment in all ~79 chunks pointing at files that are deleted before
    // the image is built, so every visitor with devtools open collects a row
    // of 404s. Sentry resolves frames from the uploaded artefact and the
    // release name, and never needs the comment.
    //
    // false when the secrets are absent: emitting maps that are not uploaded
    // and not deleted would publish readable source to every visitor.
    sourcemap: uploadSourceMaps ? "hidden" : false,
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

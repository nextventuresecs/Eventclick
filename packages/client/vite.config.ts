import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "Android/playstore-icon.png", "only_icon.png"],
      manifest: {
        name: "Eventclick",
        short_name: "Eventclick",
        description: "Event Management SaaS",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@application/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  optimizeDeps: {
    include: ["@application/shared"],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
});

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    root: "./src",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["services/**", "utils/**", "db/helpers.ts"],
    },
    // Env overrides so tests never hit real infra
    env: {
      NODE_ENV: "test",
      PORT: "0",
      DATABASE_URL: "postgresql://test:test@localhost:5432/evently_test",
      REDIS_URL: "redis://localhost:6379/1",
      JWT_SECRET: "test-jwt-secret-at-least-16",
      JWT_REFRESH_SECRET: "test-jwt-refresh-secret-at-least-16",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "7d",
      CORS_ORIGIN: "http://localhost:3000",
      APP_URL: "http://localhost:3000",
      BCRYPT_ROUNDS: "10",
      LIVEKIT_URL: "ws://localhost:7880",
      LIVEKIT_PUBLIC_URL: "ws://localhost:7880",
      LIVEKIT_API_KEY: "devkey",
      LIVEKIT_API_SECRET: "test-secret-at-least-16-chars",
      S3_ENDPOINT: "http://localhost:9000",
      S3_PUBLIC_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "evently-test",
      S3_ACCESS_KEY: "minioadmin",
      S3_SECRET_KEY: "minioadmin",
      S3_FORCE_PATH_STYLE: "true",
    },
  },
  resolve: {
    alias: {
      "@application/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});

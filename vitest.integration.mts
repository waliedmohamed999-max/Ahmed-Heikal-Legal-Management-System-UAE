import { defineConfig } from "vitest/config";
import path from "node:path";
import { testDatabaseUrl } from "./tests/integration/test-db";

// DB-backed tests of the connected core flow (Client → Case → … → Audit).
// Requires the Docker Postgres from docker-compose.yml. Run: npm run test:integration
const { url } = testDatabaseUrl();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/unit/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    environment: "node",
    env: { DATABASE_URL: url, STORAGE_LOCAL_DIR: "./storage-test", REDIS_URL: "", NODE_ENV: "test" },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});

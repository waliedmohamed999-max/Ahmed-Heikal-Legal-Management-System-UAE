import { defineConfig } from "vitest/config";
import path from "node:path";
import { testDatabaseUrl } from "./tests/integration/test-db";

// DB-backed tests against an isolated MySQL database (`<db>_test`, synthetic data only):
//  • tests/integration — the connected core flow (Client → Case → … → Audit)
//  • tests/security    — MFA, audit immutability, hard-delete guards, IDOR / permission,
//                        client isolation, uploads + malware (real ClamAV), storage (real
//                        MinIO S3), worker durability / idempotency, e-mail (real SMTP →
//                        Mailpit), concurrency, search isolation, backup + restore.
// Requires the Docker services from docker-compose.yml. Run: npm run test:integration
const { url } = testDatabaseUrl();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/unit/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    environment: "node",
    env: {
      DATABASE_URL: url,
      STORAGE_LOCAL_DIR: "./storage-test",
      REDIS_URL: "",
      NODE_ENV: "test",
      // Real local services (docker-compose): ClamAV, MinIO (S3), Mailpit (SMTP).
      MALWARE_SCANNER: "clamav",
      CLAMAV_HOST: "127.0.0.1",
      CLAMAV_PORT: "3311",
      S3_BUCKET: "ahlegal-documents",
      S3_REGION: "us-east-1",
      S3_ENDPOINT: "http://127.0.0.1:9010",
      S3_FORCE_PATH_STYLE: "true",
      S3_ACCESS_KEY_ID: "ahlegal-dev",
      S3_SECRET_ACCESS_KEY: "ahlegal_dev_only_minio",
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      SMTP_FROM: "AH Legal OS <no-reply@ahlegal.test>",
      MYSQL_DOCKER_CONTAINER: "ahlegal-mysql",
      BACKUP_DIR: "./backups-test",
      BACKUP_S3_BUCKET: "",
    },
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 300_000,
  },
});

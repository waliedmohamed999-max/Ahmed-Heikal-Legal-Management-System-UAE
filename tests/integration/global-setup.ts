import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl } from "./test-db";

/**
 * Integration tests run against a separate database (`<db>_test`), freshly migrated
 * and seeded with the synthetic demo dataset — never the development database and
 * never real client data.
 */
export default async function setup() {
  const { url, name, adminUrl } = testDatabaseUrl();
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${name}\``);
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.$disconnect();
  const env = { ...process.env, DATABASE_URL: url, SEED_DEMO: "true" };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });
}

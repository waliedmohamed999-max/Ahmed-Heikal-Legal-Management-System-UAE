import "server-only";
import Redis from "ioredis";
import { db } from "./db";
import { storage } from "./storage";
import { errMsg, logger } from "./log";

const log = logger("health");

/**
 * Readiness probe: can this instance serve requests? The HTTP response reports only "ok" /
 * "error" per dependency — never hostnames, versions, URLs or error text. The reason for a
 * failure goes to the (redacted) server log for operators.
 */
export async function readiness() {
  const withTimeout = <T,>(p: Promise<T>, ms = 3000) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const check = async (name: string, fn: () => Promise<unknown>) =>
    withTimeout(fn()).then(
      () => "ok" as const,
      (e) => {
        log.warn(`readiness: ${name} failed`, { error: errMsg(e) });
        return "error" as const;
      },
    );
  const checks = {
    database: await check("database", () => db.$queryRaw`SELECT 1`),
    storage: await check("storage", () => storage().ping()),
    redis: process.env.REDIS_URL
      ? await check("redis", async () => {
          const r = new Redis(process.env.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
          r.on("error", () => {});
          try {
            await r.connect();
            await r.ping();
          } finally {
            r.disconnect();
          }
        })
      : ("not_configured" as const),
  };
  const ok = checks.database === "ok" && checks.storage === "ok" && checks.redis !== "error";
  return { ok, checks };
}

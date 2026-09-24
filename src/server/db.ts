import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Retry a whole transaction when MySQL aborts it with a deadlock (1213) or lock-wait timeout
 * (1205) — InnoDB resolves deadlocks by rolling back one transaction, and MySQL's guidance is
 * that applications retry. The transaction is rolled back entirely before each retry, so a
 * retry never double-applies anything.
 */
export async function withTxRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string }).code;
      const retryable = code === "P2034" || /\b(1213|1205)\b|Deadlock found|Lock wait timeout/i.test(text);
      if (!retryable || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 20 * i + Math.floor(Math.random() * 30)));
    }
  }
}

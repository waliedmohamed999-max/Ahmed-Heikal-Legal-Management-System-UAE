import { dispatchDueReminders, dispatchPendingDeliveries, expireTemporaryAccess } from "@/server/services/reminders";
import { processPendingDocuments } from "@/server/services/documents-processing";
import { scanPendingVersions } from "@/server/services/malware";
import { sweepIntegrity } from "@/server/services/integrity";
import { db } from "@/server/db";
import { errMsg, logger } from "@/server/log";

const log = logger("worker");
let running: Promise<void> | null = null;

/**
 * One scheduler tick. Every job is durable (state in MySQL) and idempotent, so ticks
 * can run from several worker instances and a restart never loses work:
 *  reminders → delivery queue → malware scans → text extraction → integrity sweep.
 * A heartbeat row lets System Health show whether the worker is alive.
 */
export type ExtraJob = readonly [string, () => Promise<unknown>];

/** `extra` jobs run only where passed (the standalone worker adds backups — never the web process). */
export function tick(extra: readonly ExtraJob[] = []): Promise<void> {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    const out: Record<string, unknown> = {};
    for (const [name, job] of [
      ["reminders", () => dispatchDueReminders()],
      ["deliveries", () => dispatchPendingDeliveries()],
      ["expiredAccess", () => expireTemporaryAccess()],
      ["scans", () => scanPendingVersions(10)],
      ["extraction", () => processPendingDocuments(5)],
      ["integrity", () => sweepIntegrity(20)],
      ...extra,
    ] as const) {
      try {
        out[name] = await job();
      } catch (e) {
        out[name] = "error";
        log.error(`${name} job failed`, { error: errMsg(e) });
      }
    }
    await db.systemStatus
      .upsert({ where: { key: "worker.heartbeat" }, create: { key: "worker.heartbeat", value: { at: new Date().toISOString(), ms: Date.now() - started, ...out } }, update: { value: { at: new Date().toISOString(), ms: Date.now() - started, ...out } } })
      .catch((e) => log.error("heartbeat failed", { error: errMsg(e) }));
    const busy = Object.values(out).some((v) => (typeof v === "number" && v > 0) || (typeof v === "object" && v && (v as { checked?: number }).checked));
    if (busy) log.info("tick", out);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Resolve once any in-flight tick has finished (graceful shutdown). */
export async function drain() {
  if (running) await running;
}

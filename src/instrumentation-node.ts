/**
 * Node.js-only server boot (imported from instrumentation.ts when NEXT_RUNTIME === "nodejs"):
 *  1. Validate the environment — a missing, weak or placeholder secret stops the server.
 *  2. In production, refuse to start while demo data exists in the database.
 *  3. In development only, run the scheduler in-process so reminders work without a second
 *     process. Production runs the dedicated worker (`npm run worker`).
 */
import { parseConfig } from "./server/config";
import { logger } from "./server/log";

export async function registerNode() {
  const log = logger("boot");
  const r = parseConfig(process.env);
  if (!r.config) {
    log.error("invalid configuration — refusing to start", { errors: r.errors });
    process.exit(1); // never serve with an invalid configuration
  }
  for (const w of r.warnings) log.warn(w);

  if (r.config.NODE_ENV === "production") {
    const { assertNoDemoData } = await import("./server/boot-checks");
    try {
      await assertNoDemoData();
    } catch (e) {
      log.error("production safety check failed — refusing to start", { error: e instanceof Error ? e.message : String(e) });
      process.exit(1);
    }
  }

  if (process.env.RUN_WORKER_IN_PROCESS === "false") return;
  if (process.env.NODE_ENV === "production" && process.env.RUN_WORKER_IN_PROCESS !== "true") return;
  const g = globalThis as unknown as { __ahlWorker?: NodeJS.Timeout };
  if (g.__ahlWorker) return;
  const { tick } = await import("./worker/jobs");
  g.__ahlWorker = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 5_000);
}

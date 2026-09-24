/**
 * Standalone background worker (production): `npm run worker`
 * (runs with `--conditions=react-server` so server-only modules load outside Next.js).
 *
 * Jobs: reminder dispatch, notification delivery queue (e-mail/SMS/WhatsApp), temporary
 * access expiry, malware scanning, text extraction / OCR, document integrity sweep.
 * All state lives in MySQL, so a restart or crash never loses a job.
 */
import { parseConfig } from "@/server/config";
import { assertNoDemoData } from "@/server/boot-checks";
import { errMsg, logger } from "@/server/log";
import { drain, tick, type ExtraJob } from "./jobs";
import { runRequestedBackups } from "./backup-requests";

// Backups requested from Settings run here only (the web process never spawns mysqldump).
const EXTRA: ExtraJob[] = [["requestedBackups", () => runRequestedBackups()]];

const log = logger("worker");

async function main() {
  const r = parseConfig(process.env);
  if (!r.config) {
    log.error("invalid configuration — refusing to start", { errors: r.errors });
    process.exit(1);
  }
  for (const w of r.warnings) log.warn(w);
  if (r.config.NODE_ENV === "production") await assertNoDemoData();

  const interval = r.config.WORKER_INTERVAL_MS;
  log.info("started", { intervalMs: interval });
  void tick(EXTRA);
  const handle = setInterval(() => void tick(EXTRA), interval);

  const stop = async (signal: string) => {
    log.info("stopping", { signal });
    clearInterval(handle);
    await drain(); // finish the current tick; leases protect anything interrupted anyway
    process.exit(0);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

main().catch((e) => {
  log.error("worker failed to start", { error: errMsg(e) });
  process.exit(1);
});

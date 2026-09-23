/**
 * Standalone background worker (production): `npm run worker`
 * Runs reminder dispatch, temporary-access expiry and document text extraction.
 */
import "dotenv/config";
import { tick } from "./jobs";

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
console.log(`[worker] started — interval ${INTERVAL}ms`);
void tick();
const handle = setInterval(tick, INTERVAL);
const stop = () => {
  clearInterval(handle);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

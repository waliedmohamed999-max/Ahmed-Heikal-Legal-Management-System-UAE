/**
 * In development the scheduler runs inside the Next.js server so reminders work
 * without a second process. In production run `npm run worker` and set
 * RUN_WORKER_IN_PROCESS=false on web instances.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_WORKER_IN_PROCESS === "false") return;
  if (process.env.NODE_ENV === "production" && process.env.RUN_WORKER_IN_PROCESS !== "true") return;
  const g = globalThis as unknown as { __ahlWorker?: NodeJS.Timeout };
  if (g.__ahlWorker) return;
  const { tick } = await import("./worker/jobs");
  g.__ahlWorker = setInterval(tick, 60_000);
  setTimeout(tick, 5_000);
}

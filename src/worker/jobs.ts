import { dispatchDueReminders, expireTemporaryAccess } from "@/server/services/reminders";
import { processPendingDocuments } from "@/server/services/documents-processing";

let running = false;

/**
 * One scheduler tick. Idempotent and safe to run from several instances:
 * reminders are claimed atomically, documents are claimed by status transition.
 */
export async function tick() {
  if (running) return;
  running = true;
  try {
    const sent = await dispatchDueReminders();
    const expired = await expireTemporaryAccess();
    const processed = await processPendingDocuments(5);
    if (sent || expired || processed) console.log(`[worker] reminders=${sent} expiredAccess=${expired} documents=${processed}`);
  } catch (e) {
    console.error("[worker] tick failed", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

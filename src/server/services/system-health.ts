import "server-only";
import type { StaffContext } from "../auth/session";
import { db } from "../db";
import { env } from "../env";
import { readiness } from "../health";
import { assertPermission } from "./access";
import { ADAPTERS, verifyEmailTransport } from "./channels";
import { clamdPing, scannerConfigured } from "./malware";
import { aiStatus } from "./ai/provider";

export type HealthState = "HEALTHY" | "WARNING" | "NOT_CONFIGURED" | "ERROR";
export type HealthModule = { key: string; state: HealthState; detail?: string; at?: string | null };

type Heartbeat = { at?: string };
type Last = { at?: string; failed?: boolean; ok?: boolean; offsite?: boolean; encrypted?: boolean; mode?: string };

const hoursSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600_000 : Infinity);

/**
 * Settings → System health. Live checks of each dependency, reported as a state and a
 * short non-sensitive detail. Never shows hostnames, credentials, connection strings or
 * raw error messages.
 */
export async function systemHealth(ctx: StaffContext) {
  assertPermission(ctx, "settings.manage");
  const c = env();
  const ready = await readiness();
  const status = await db.systemStatus.findMany({ where: { key: { in: ["worker.heartbeat", "backup.db.last", "backup.storage.last", "backup.restoreTest.last"] } } });
  const s = Object.fromEntries(status.map((r) => [r.key, r.value])) as Record<string, (Heartbeat & Last) | undefined>;
  const [pendingReminders, failedReminders, pendingDeliveries, failedDeliveries, quarantined, infected, integrityFailed] = await Promise.all([
    db.reminder.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, fireAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
    db.reminder.count({ where: { status: "FAILED" } }),
    db.notificationDelivery.count({ where: { status: { in: ["PENDING", "SENDING"] } } }),
    db.notificationDelivery.count({ where: { status: "FAILED" } }),
    db.documentVersion.count({ where: { scanStatus: { in: ["PENDING", "SCANNING", "ERROR"] } } }),
    db.documentVersion.count({ where: { scanStatus: "INFECTED" } }),
    db.documentVersion.count({ where: { integrityStatus: { in: ["MISMATCH", "MISSING"] } } }),
  ]);

  const modules: HealthModule[] = [];
  modules.push({ key: "database", state: ready.checks.database === "ok" ? "HEALTHY" : "ERROR", detail: "MySQL" });
  modules.push({
    key: "storage",
    state: ready.checks.storage !== "ok" ? "ERROR" : c.STORAGE_DRIVER === "local" ? "WARNING" : integrityFailed ? "WARNING" : "HEALTHY",
    detail: c.STORAGE_DRIVER === "s3" ? `S3 (${c.S3_SSE === "aws:kms" ? "SSE-KMS" : "SSE-S3"}, private)${integrityFailed ? ` · ${integrityFailed} integrity failures` : ""}` : "Local disk (development / acknowledged encrypted volume)",
  });
  const mail = await verifyEmailTransport();
  modules.push({ key: "email", state: mail === "CONNECTED" ? "HEALTHY" : mail === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "ERROR", detail: mail === "CONNECTED" ? "SMTP" : undefined });
  const ai = aiStatus(ctx);
  modules.push({
    key: "ai",
    state: !ai.keyConfigured ? "NOT_CONFIGURED" : ai.enabled ? "WARNING" : "NOT_CONFIGURED",
    detail: !ai.keyConfigured ? "No provider key" : ai.enabled ? `${ai.model} — configured; not verified with a live request` : "Key present; disabled in Settings → AI",
  });
  modules.push({ key: "ocr", state: "NOT_CONFIGURED", detail: "Text PDF / DOCX extraction built in; image OCR provider not configured" });
  modules.push({ key: "sms", state: ADAPTERS.SMS.configured() ? "WARNING" : "NOT_CONFIGURED", detail: ADAPTERS.SMS.configured() ? "Configured; not verified with a live account" : undefined });
  modules.push({ key: "whatsapp", state: ADAPTERS.WHATSAPP.configured() ? "WARNING" : "NOT_CONFIGURED", detail: ADAPTERS.WHATSAPP.configured() ? "Cloud API configured; not verified with a live account" : undefined });

  const beat = s["worker.heartbeat"]?.at ?? null;
  const beatAge = hoursSince(beat) * 60;
  modules.push({
    key: "queue",
    state: beatAge > 10 ? "ERROR" : failedReminders || failedDeliveries || pendingReminders || beatAge > 3 ? "WARNING" : "HEALTHY",
    detail: `${beat ? `worker seen ${Math.round(beatAge)} min ago` : "worker never seen"} · overdue reminders ${pendingReminders} · failed reminders ${failedReminders} · queued deliveries ${pendingDeliveries} · failed deliveries ${failedDeliveries}`,
    at: beat,
  });

  const lastDb = s["backup.db.last"];
  const lastRestore = s["backup.restoreTest.last"];
  const lastStorage = s["backup.storage.last"];
  const backupsState: HealthState =
    !c.BACKUP_ENCRYPTION_KEY ? "NOT_CONFIGURED"
    : !lastDb || lastDb.failed || hoursSince(lastDb.at) > 26 || !lastRestore?.ok ? "ERROR"
    : !lastDb.offsite || hoursSince(lastRestore.at) > 24 * 8 ? "WARNING"
    : "HEALTHY";
  modules.push({ key: "backups", state: backupsState, detail: lastDb?.offsite ? "Encrypted, off-site copy" : lastDb ? "Encrypted, local only" : undefined });

  const scanner = scannerConfigured() ? await clamdPing() : null;
  modules.push({
    key: "malware",
    state: scanner === null ? "NOT_CONFIGURED" : !scanner ? "ERROR" : infected || quarantined ? "WARNING" : "HEALTHY",
    detail: scanner === null ? "Uploads served as NOT_SCANNED" : `ClamAV · ${quarantined} awaiting scan · ${infected} infected (quarantined)`,
  });

  return {
    modules,
    backups: {
      lastDb: lastDb?.at ?? null, lastDbOk: !!lastDb && !lastDb.failed,
      lastStorage: lastStorage?.at ?? null,
      lastRestoreTest: lastRestore?.at ?? null, lastRestoreOk: !!lastRestore?.ok,
    },
    checkedAt: new Date().toISOString(),
  };
}

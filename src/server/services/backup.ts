import "server-only";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { audit } from "../audit";
import { assertPermission } from "./access";

/**
 * Settings → Backups → "Run backup now".
 *
 * The web process never spawns mysqldump (that would also make the build tracer pull the whole
 * project into the server bundle). The button records a REQUESTED backup; the worker picks it
 * up within a minute and runs the same engine as the nightly job
 * (mysqldump → gzip → AES-256-GCM → off-site copy → retention). The result appears in the
 * backup history and in Settings → System health.
 */
export async function runDatabaseBackup(ctx: StaffContext) {
  assertPermission(ctx, "settings.manage");
  const pending = await db.backupRecord.findFirst({ where: { organizationId: ctx.org.id, kind: "DATABASE", status: { in: ["REQUESTED", "RUNNING"] } } });
  if (pending) return { ok: true, queued: true };
  const rec = await db.backupRecord.create({ data: { organizationId: ctx.org.id, kind: "DATABASE", status: "REQUESTED" } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "backup.requested", entityType: "BackupRecord", entityId: rec.id });
  return { ok: true, queued: true };
}

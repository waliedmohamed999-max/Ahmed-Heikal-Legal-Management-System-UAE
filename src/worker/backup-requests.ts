import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { backupDatabase, backupKeys, pruneBackups, uploadOffsite } from "@/server/backup";
import { errMsg, logger } from "@/server/log";

const log = logger("backup");

/** Worker job: execute backups requested from Settings → Backups (claimed atomically). */
export async function runRequestedBackups() {
  const req = await db.backupRecord.findFirst({ where: { status: "REQUESTED", kind: "DATABASE" }, orderBy: { startedAt: "asc" } });
  if (!req) return 0;
  const claimed = await db.backupRecord.updateMany({ where: { id: req.id, status: "REQUESTED" }, data: { status: "RUNNING", startedAt: new Date() } });
  if (!claimed.count) return 0;
  const dir = process.env.BACKUP_DIR || "./backups";
  try {
    const [key] = backupKeys();
    const m = await backupDatabase({ url: process.env.DATABASE_URL!, dir, key });
    m.offsite = await uploadOffsite(dir, m);
    await pruneBackups(dir, Number(process.env.BACKUP_RETENTION_DAYS || 35));
    await db.backupRecord.update({ where: { id: req.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), location: m.offsite ?? m.file, sizeBytes: BigInt(m.encryptedBytes), checksum: m.encryptedSha256 } });
    const value = { at: m.createdAt, file: m.file, bytes: m.encryptedBytes, encrypted: true, keyId: m.keyId, offsite: !!m.offsite };
    await db.systemStatus.upsert({ where: { key: "backup.db.last" }, create: { key: "backup.db.last", value }, update: { value } });
    await audit({ organizationId: req.organizationId, action: "backup.completed", entityType: "BackupRecord", entityId: req.id, metadata: { checksum: m.encryptedSha256, size: m.encryptedBytes, offsite: !!m.offsite } });
    return 1;
  } catch (e) {
    const msg = errMsg(e).replace(/password\S*/gi, "password=[redacted]");
    log.error("requested backup failed", { id: req.id, error: msg });
    await db.backupRecord.update({ where: { id: req.id }, data: { status: "FAILED", finishedAt: new Date(), error: msg.slice(0, 300) } });
    await audit({ organizationId: req.organizationId, action: "backup.failed", entityType: "BackupRecord", entityId: req.id, metadata: { error: msg.slice(0, 200) } });
    return 0;
  }
}

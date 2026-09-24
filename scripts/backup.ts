/**
 * Backups (MySQL). Run with: npm run backup -- <command>
 *
 *   db            encrypted mysqldump (+ off-site copy if BACKUP_S3_BUCKET) and retention pruning
 *   storage       encrypted archive of the local document store (STORAGE_DRIVER=local)
 *   restore-test  restore the latest DB backup into an isolated database, validate, drop it
 *   all           db + storage + restore-test (the nightly job)
 *
 * Schedule `all` daily (cron / Kubernetes CronJob / Windows Task Scheduler). Exit code ≠ 0 on failure.
 * Every run is recorded in BackupRecord and SystemStatus (shown in Settings → System health).
 */
import { PrismaClient } from "@prisma/client";
import { backupDatabase, backupKeys, backupLocalStorage, pruneBackups, restoreTest, uploadOffsite, type Manifest } from "../src/server/backup";
import { verifyAuditChain } from "../src/server/audit";
import { logger } from "../src/server/log";

const log = logger("backup");
const db = new PrismaClient();
const DIR = process.env.BACKUP_DIR || "./backups";

async function orgId() {
  const o = await db.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!o) throw new Error("No organisation found — seed the foundation first");
  return o.id;
}

async function status(key: string, value: Record<string, unknown>) {
  await db.systemStatus.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}

async function runDb() {
  const [key] = backupKeys();
  const org = await orgId();
  const rec = await db.backupRecord.create({ data: { organizationId: org, kind: "DATABASE", status: "RUNNING" } });
  try {
    const m: Manifest = await backupDatabase({ url: process.env.DATABASE_URL!, dir: DIR, key });
    m.offsite = await uploadOffsite(DIR, m);
    const pruned = await pruneBackups(DIR, Number(process.env.BACKUP_RETENTION_DAYS || 35));
    await db.backupRecord.update({ where: { id: rec.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), location: m.offsite ?? `${DIR}/${m.file}`, sizeBytes: BigInt(m.encryptedBytes), checksum: m.encryptedSha256 } });
    await status("backup.db.last", { at: m.createdAt, file: m.file, bytes: m.encryptedBytes, encrypted: true, keyId: m.keyId, offsite: !!m.offsite, pruned });
    log.info("database backup completed", { file: m.file, bytes: m.encryptedBytes, offsite: !!m.offsite, pruned });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.backupRecord.update({ where: { id: rec.id }, data: { status: "FAILED", finishedAt: new Date(), error: msg.slice(0, 300) } });
    await status("backup.db.last", { at: new Date().toISOString(), failed: true, error: msg.slice(0, 200) });
    throw e;
  }
}

async function runStorage() {
  if ((process.env.STORAGE_DRIVER || "local") !== "local") {
    log.info("object storage: rely on bucket versioning + replication (see docs/BACKUP-RESTORE.md); nothing to archive");
    await status("backup.storage.last", { at: new Date().toISOString(), mode: "bucket-versioning-replication" });
    return;
  }
  const [key] = backupKeys();
  const org = await orgId();
  const rec = await db.backupRecord.create({ data: { organizationId: org, kind: "DOCUMENTS", status: "RUNNING" } });
  try {
    const m = await backupLocalStorage({ storageDir: process.env.STORAGE_LOCAL_DIR || "./storage", dir: DIR, key });
    m.offsite = await uploadOffsite(DIR, m);
    await db.backupRecord.update({ where: { id: rec.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), location: m.offsite ?? `${DIR}/${m.file}`, sizeBytes: BigInt(m.encryptedBytes), checksum: m.encryptedSha256 } });
    await status("backup.storage.last", { at: m.createdAt, file: m.file, bytes: m.encryptedBytes, encrypted: true, offsite: !!m.offsite });
    log.info("document store backup completed", { file: m.file, bytes: m.encryptedBytes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.backupRecord.update({ where: { id: rec.id }, data: { status: "FAILED", finishedAt: new Date(), error: msg.slice(0, 300) } });
    throw e;
  }
}

async function runRestoreTest() {
  const org = await orgId();
  const rec = await db.backupRecord.create({ data: { organizationId: org, kind: "RESTORE_TEST", status: "RUNNING" } });
  const report = await restoreTest({
    url: process.env.DATABASE_URL!,
    dir: DIR,
    keys: backupKeys(),
    keep: process.argv.includes("--keep"),
    verifyAuditChain: async (isolatedUrl) => {
      const iso = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
      try {
        let checked = 0;
        for (const o of await iso.organization.findMany({ select: { id: true } })) {
          const r = await verifyAuditChain(o.id, iso);
          checked += r.checked;
          if (!r.ok) return { ok: false, checked };
        }
        return { ok: true, checked };
      } finally {
        await iso.$disconnect();
      }
    },
  });
  await db.backupRecord.update({ where: { id: rec.id }, data: { status: report.ok ? "SUCCEEDED" : "FAILED", finishedAt: new Date(), location: report.backupFile, error: report.errors.join("; ").slice(0, 300) || null } });
  await status("backup.restoreTest.last", { at: new Date().toISOString(), ok: report.ok, file: report.backupFile, durationMs: report.durationMs, triggers: report.triggers, auditChain: report.auditChain, errors: report.errors.slice(0, 5) });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error(`restore test FAILED: ${report.errors.join("; ")}`);
  log.info("restore test passed", { file: report.backupFile, durationMs: report.durationMs });
}

const cmd = process.argv[2];
const run = { db: runDb, storage: runStorage, "restore-test": runRestoreTest, all: async () => { await runDb(); await runStorage(); await runRestoreTest(); } }[cmd ?? ""];
if (!run) {
  console.error("usage: npm run backup -- db | storage | restore-test [--keep] | all");
  process.exit(2);
}
run()
  .catch((e) => {
    log.error("backup command failed", { command: cmd, error: e instanceof Error ? e.message : String(e) });
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

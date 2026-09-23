import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { audit } from "../audit";
import { assertPermission } from "./access";

/**
 * On-demand database backup using pg_dump (custom format). In production the same
 * routine is scheduled by the infrastructure; this records status and checksums.
 * If pg_dump is not installed on the host the run is recorded as FAILED — never faked.
 */
export async function runDatabaseBackup(ctx: StaffContext) {
  assertPermission(ctx, "settings.manage");
  const rec = await db.backupRecord.create({ data: { organizationId: ctx.org.id, kind: "DATABASE", status: "RUNNING" } });
  const dir = path.resolve(process.env.BACKUP_DIR ?? "./backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `db-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.delete("schema");
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn(process.env.PG_DUMP_PATH ?? "pg_dump", ["--format=custom", "--no-owner", `--file=${file}`, url.toString()], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("error", (e) => reject(new Error(`pg_dump not available: ${e.message}`)));
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(0, 300) || `pg_dump exited ${code}`))));
    });
    const [s, buf] = await Promise.all([stat(file), readFile(file)]);
    const checksum = createHash("sha256").update(buf).digest("hex");
    await db.backupRecord.update({ where: { id: rec.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), location: file, sizeBytes: BigInt(s.size), checksum } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "backup.completed", entityType: "BackupRecord", entityId: rec.id, metadata: { checksum, size: s.size } });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "backup failed";
    await db.backupRecord.update({ where: { id: rec.id }, data: { status: "FAILED", finishedAt: new Date(), error: msg.slice(0, 300) } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "backup.failed", entityType: "BackupRecord", entityId: rec.id, metadata: { error: msg.slice(0, 200) } });
    return { ok: false };
  }
}

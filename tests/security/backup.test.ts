/**
 * Backup + restore on MySQL (real mysqldump / mysql client inside the MySQL container):
 * encrypted backup → restore into an isolated database → validation → drop.
 * Also: wrong key and tampered file are rejected (AES-256-GCM authentication).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { db } from "@/server/db";
import { audit, verifyAuditChain } from "@/server/audit";
import { backupDatabase, decryptFileStream, keyId, mysqlQuery, parseMysqlUrl, restoreTest } from "@/server/backup";

const DIR = path.resolve("./backups-test");
const key = randomBytes(32);
let file = "";

beforeAll(async () => {
  await rm(DIR, { recursive: true, force: true });
  const org = await db.organization.findFirstOrThrow({ where: { slug: "ahmed-heikal" } });
  // Make sure the audit chain has entries to verify in the restored copy.
  for (let i = 0; i < 3; i++) await audit({ organizationId: org.id, action: "test.backup_marker", entityType: "Test", entityId: String(i) });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("encrypted MySQL backup", () => {
  it("produces an encrypted, checksummed dump with a manifest (no plaintext SQL at rest)", async () => {
    const m = await backupDatabase({ url: process.env.DATABASE_URL!, dir: DIR, key, label: "test" });
    file = m.file;
    expect(m.keyId).toBe(keyId(key));
    expect(m.encryptedSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.rowCounts?.AuditLog).toBeGreaterThan(0);
    const raw = await readFile(path.join(DIR, m.file));
    expect(raw.subarray(0, 6).toString()).toBe("AHLBK1");
    expect(raw.includes(Buffer.from("CREATE TABLE"))).toBe(false); // encrypted
    expect(raw.includes(Buffer.from("ahmed@demo.ahlegal.test"))).toBe(false);
  });

  it("the manifest never contains the database password or the key", async () => {
    const manifest = await readFile(path.join(DIR, file.replace(/\.sql\.gz\.enc$/, ".manifest.json")), "utf8");
    expect(manifest).not.toContain(parseMysqlUrl(process.env.DATABASE_URL!).password);
    expect(manifest).not.toContain(key.toString("base64"));
  });
});

describe("restore test (isolated database)", () => {
  it("restores, validates counts / relationships / triggers / audit chain, then drops the copy", async () => {
    const report = await restoreTest({
      url: process.env.DATABASE_URL!,
      dir: DIR,
      file,
      keys: [randomBytes(32), key], // key rotation: the right key is picked by key id
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
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checksumVerified).toBe(true);
    expect(report.triggers).toBeGreaterThanOrEqual(24);
    expect(report.auditChain?.ok).toBe(true);
    expect(report.auditChain?.checked).toBeGreaterThan(0);
    for (const v of Object.values(report.relationships)) expect(v).toBe(0);
    // The isolated database is gone afterwards.
    const dbs = await mysqlQuery(parseMysqlUrl(process.env.DATABASE_URL!), `SHOW DATABASES LIKE '${report.isolatedDatabase}'`);
    expect(dbs).toHaveLength(0);
  });

  it("a wrong key cannot decrypt the backup", async () => {
    const s = (await decryptFileStream(path.join(DIR, file), randomBytes(32))).pipe(createGunzip());
    await expect((async () => { for await (const _ of s) void _; })()).rejects.toThrow();
  });

  it("a tampered backup is detected (checksum + GCM tag) and the restore test fails", async () => {
    const p = path.join(DIR, file);
    const buf = await readFile(p);
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    await writeFile(p, buf);
    const report = await restoreTest({ url: process.env.DATABASE_URL!, dir: DIR, file, keys: [key] });
    expect(report.ok).toBe(false);
    expect(report.checksumVerified).toBe(false);
  });
});

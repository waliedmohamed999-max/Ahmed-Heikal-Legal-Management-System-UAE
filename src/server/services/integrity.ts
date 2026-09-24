import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { storage } from "../storage";
import { audit } from "../audit";
import { logger } from "../log";
import { notify } from "./notifications";

const log = logger("integrity");

export type IntegrityResult = "OK" | "MISMATCH" | "MISSING";

/**
 * Re-hash a stored document version and compare it with the SHA-256 recorded at upload.
 * MISMATCH (file changed outside the application) or MISSING blocks the version for
 * everyone (see isServable), is audited and alerts administrators.
 */
export async function verifyVersionIntegrity(versionId: string): Promise<IntegrityResult> {
  const v = await db.documentVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { document: { select: { id: true, organizationId: true, matterId: true, title: true } } },
  });
  let result: IntegrityResult;
  if (!(await storage().exists(v.storageKey))) result = "MISSING";
  else {
    const hash = createHash("sha256");
    const { stream } = await storage().stream(v.storageKey);
    for await (const chunk of stream as AsyncIterable<Buffer>) hash.update(chunk);
    result = hash.digest("hex") === v.checksumSha256 ? "OK" : "MISMATCH";
  }
  const previously = v.integrityStatus;
  await db.documentVersion.update({ where: { id: v.id }, data: { integrityStatus: result, integrityCheckedAt: new Date() } });
  if (result !== "OK" && previously !== result) {
    log.error("document integrity failure", { versionId: v.id, documentId: v.document.id, result });
    await audit({ organizationId: v.document.organizationId, action: "document.integrity_failed", entityType: "Document", entityId: v.document.id, matterId: v.document.matterId, metadata: { versionId: v.id, version: v.version, result } });
    const admins = await db.user.findMany({
      where: { organizationId: v.document.organizationId, status: "ACTIVE", kind: "STAFF", role: { permissions: { some: { permissionKey: "settings.manage" } } } },
      select: { id: true },
    });
    await notify({
      organizationId: v.document.organizationId, userIds: admins.map((a) => a.id), category: "CRITICAL", titleKey: "notif.integrityFailed",
      params: { title: v.document.title }, link: `/app/documents/${v.document.id}`, entityType: "Document", entityId: v.document.id, dedupeKey: `integrity:${v.id}:${result}`,
    });
  }
  return result;
}

/** Worker sweep: re-verify the versions checked least recently (never-checked first). */
export async function sweepIntegrity(limit = 20) {
  const rows = await db.documentVersion.findMany({
    where: { scanStatus: { not: "INFECTED" } },
    orderBy: [{ integrityCheckedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });
  const out = { checked: 0, failed: 0 };
  for (const r of rows) {
    const res = await verifyVersionIntegrity(r.id).catch(() => null);
    if (res) out.checked++;
    if (res && res !== "OK") out.failed++;
  }
  return out;
}

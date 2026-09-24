/**
 * Database-level safeguards on MySQL (triggers from the migrations), tested through the
 * application's own database client — i.e. what a bug, a bad script or a compromised
 * code path could attempt.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { audit, verifyAuditChain } from "@/server/audit";

let orgId = "";
beforeAll(async () => {
  orgId = (await db.organization.findFirstOrThrow({ where: { slug: "ahmed-heikal" } })).id;
});
afterAll(async () => {
  await db.$disconnect();
});

describe("immutable audit log", () => {
  it("INSERT succeeds and the hash chain verifies", async () => {
    await audit({ organizationId: orgId, action: "test.audit_insert", entityType: "Test", entityId: "1", after: { password: "should-be-redacted", value: 1 } });
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "test.audit_insert" }, orderBy: { seq: "desc" } });
    expect(JSON.stringify(row.after)).not.toContain("should-be-redacted");
    expect((await verifyAuditChain(orgId)).ok).toBe(true);
  });

  it("UPDATE fails (ORM and raw SQL)", async () => {
    const row = await db.auditLog.findFirstOrThrow({ where: { organizationId: orgId }, orderBy: { seq: "desc" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe("UPDATE `AuditLog` SET action = 'tampered' WHERE id = ?", row.id)).rejects.toThrow(/append-only/);
    await expect(db.auditLog.updateMany({ where: { organizationId: orgId }, data: { ip: "1.1.1.1" } })).rejects.toThrow(/append-only/);
  });

  it("DELETE fails (ORM and raw SQL)", async () => {
    const row = await db.auditLog.findFirstOrThrow({ where: { organizationId: orgId }, orderBy: { seq: "desc" } });
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe("DELETE FROM `AuditLog` WHERE id = ?", row.id)).rejects.toThrow(/append-only/);
    expect(await db.auditLog.count({ where: { id: row.id } })).toBe(1);
  });
});

describe("legal records cannot be hard-deleted", () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["Matter", async () => db.matter.delete({ where: { id: (await db.matter.findFirstOrThrow()).id } })],
    ["Client", async () => db.client.delete({ where: { id: (await db.client.findFirstOrThrow()).id } })],
    ["Document", async () => db.document.delete({ where: { id: (await db.document.findFirstOrThrow()).id } })],
    ["DocumentVersion", async () => db.documentVersion.delete({ where: { id: (await db.documentVersion.findFirstOrThrow()).id } })],
    ["Hearing", async () => db.hearing.delete({ where: { id: (await db.hearing.findFirstOrThrow()).id } })],
    ["Deadline", async () => db.deadline.delete({ where: { id: (await db.deadline.findFirstOrThrow()).id } })],
    ["Invoice", async () => db.invoice.delete({ where: { id: (await db.invoice.findFirstOrThrow()).id } })],
    ["Payment", async () => db.payment.delete({ where: { id: (await db.payment.findFirstOrThrow()).id } })],
    ["TimelineEvent", async () => db.timelineEvent.deleteMany({})],
    ["Note", async () => db.note.deleteMany({})],
  ];
  for (const [table, attempt] of cases) {
    it(`${table}: DELETE is rejected by the database`, async () => {
      await expect(attempt()).rejects.toThrow(/Hard delete blocked/);
    });
  }

  it("raw SQL DELETE is rejected too", async () => {
    await expect(db.$executeRawUnsafe("DELETE FROM `Matter` LIMIT 1")).rejects.toThrow(/Hard delete blocked/);
  });

  it("soft delete (deletedAt) still works", async () => {
    const d = await db.deadline.findFirstOrThrow({ where: { deletedAt: null } });
    await db.deadline.update({ where: { id: d.id }, data: { deletedAt: new Date() } });
    expect((await db.deadline.findUniqueOrThrow({ where: { id: d.id } })).deletedAt).not.toBeNull();
    await db.deadline.update({ where: { id: d.id }, data: { deletedAt: null } });
  });
});

describe("legal deadline safety", () => {
  it("an AI/imported deadline cannot be stored as CONFIRMED without a verifier (DB trigger)", async () => {
    const d = await db.deadline.findFirstOrThrow({ where: { deletedAt: null } });
    await expect(
      db.deadline.create({ data: { organizationId: d.organizationId, matterId: d.matterId, title: "AI extracted", dueAt: new Date(), type: "OTHER", source: "AI", verification: "CONFIRMED" } }),
    ).rejects.toThrow(/verifier/);
  });
});

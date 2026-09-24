/**
 * End-to-end test of the connected core, through the real services and a real
 * (isolated, synthetic) database:
 *   client → case → assign lawyer → restrict another lawyer → upload document →
 *   hearing → reminders → approve document → invoice → payment → close case → audit
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { contextFromSession, type StaffContext } from "@/server/auth/session";
import { createClient } from "@/server/services/clients";
import { createMatter, setMatterStatus, upsertMember, memberSchema } from "@/server/services/matters";
import { assertMatter, matterAccess } from "@/server/services/access";
import { storeUpload, transitionDocument, uploadMetaSchema, loadDocumentForUser } from "@/server/services/documents";
import { createHearing } from "@/server/services/events";
import { dispatchDueReminders } from "@/server/services/reminders";
import { saveInvoice, setInvoiceStatus, recordPayment } from "@/server/services/finance";
import { verifyAuditChain } from "@/server/audit";
import { clientSchema, intakeSchema, hearingSchema } from "@/lib/schemas";
import { invoiceSchema, paymentSchema } from "@/lib/finance-schemas";
import { toZonedLocalInput } from "@/lib/time";

async function ctxFor(email: string): Promise<StaffContext> {
  const user = await db.user.findFirstOrThrow({ where: { email } });
  const session = await db.session.create({
    data: { userId: user.id, realm: "STAFF", mfaVerified: true, tokenHash: `test-${user.id}-${Date.now()}-${Math.random()}`, expiresAt: new Date(Date.now() + 3600_000) },
    include: { user: { include: { role: { include: { permissions: { select: { permissionKey: true } } } }, organization: true } } },
  });
  return contextFromSession(session);
}

// Minimal valid one-page PDF (synthetic content).
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

let owner: StaffContext, sara: StaffContext, omar: StaffContext;
const s: { clientId?: string; matterId?: string; docId?: string; hearingId?: string; invoiceId?: string } = {};

beforeAll(async () => {
  [owner, sara, omar] = await Promise.all([ctxFor("ahmed@demo.ahlegal.test"), ctxFor("sara@demo.ahlegal.test"), ctxFor("omar@demo.ahlegal.test")]);
});
afterAll(async () => {
  await db.$disconnect();
});

describe("connected core flow", () => {
  it("creates a client", async () => {
    const r = await createClient(owner, clientSchema.parse({ type: "COMPANY", nameEn: "Integration Test Trading LLC", email: "it@example.test", source: "WEBSITE" }));
    s.clientId = r.id;
    expect(await db.client.count({ where: { id: r.id, clientNumber: { startsWith: "CL-" } } })).toBe(1);
  });

  it("opens a case and assigns a lawyer", async () => {
    const r = await createMatter(owner, intakeSchema.parse({ clientId: s.clientId, kind: "COURT_CASE", title: "Integration Test v. Sample Opponent", conflictStatus: "CLEAR", members: [{ userId: sara.user.id, role: "ASSIGNED" }] }));
    s.matterId = r.id;
    expect(r.internalNumber).toMatch(/^AH-\d{4}-\d{5}$/);
    const acc = await matterAccess(sara, r.id);
    expect(acc.has("matters.view")).toBe(true);
    expect(acc.has("hearings.manage")).toBe(true);
  });

  it("keeps another (unassigned) lawyer out, without revealing the case", async () => {
    await expect(assertMatter(omar, s.matterId!, "matters.view")).rejects.toMatchObject({ code: "notFound" });
    // Restricted membership: documents only — no hearings.
    await upsertMember(owner, memberSchema.parse({ matterId: s.matterId, userId: omar.user.id, role: "DOCUMENTS_ONLY" }));
    const acc = await matterAccess(omar, s.matterId!);
    expect(acc.has("documents.view")).toBe(true);
    expect(acc.has("hearings.view")).toBe(false);
    await expect(assertMatter(omar, s.matterId!, "hearings.manage")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("uploads a document (magic bytes checked, hash stored)", async () => {
    const r = await storeUpload(sara, { name: "reply-memo.pdf", buffer: PDF }, uploadMetaSchema.parse({ matterId: s.matterId, category: "LEGAL_MEMO", title: "Reply memorandum" }));
    s.docId = r.id;
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: r.id } });
    expect(v.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(storeUpload(sara, { name: "fake.pdf", buffer: Buffer.from("not a pdf") }, uploadMetaSchema.parse({ matterId: s.matterId }))).rejects.toMatchObject({ code: "fileType" });
  });

  it("schedules a hearing and materialises reminders", async () => {
    const at = toZonedLocalInput(new Date(Date.now() + 4 * 86400_000), "Asia/Dubai").slice(0, 11) + "10:00";
    const r = await createHearing(sara, hearingSchema.parse({ matterId: s.matterId, startsAt: at, attendingLawyerId: sara.user.id, sessionType: "First session" }));
    s.hearingId = r.id;
    const reminders = await db.reminder.findMany({ where: { subjectType: "HEARING", subjectId: r.id, status: "PENDING" } });
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((x) => x.fireAt > new Date())).toBe(true);
    // Worker tick: nothing is due yet, so nothing is sent early.
    await dispatchDueReminders(new Date());
    expect(await db.reminder.count({ where: { subjectId: r.id, status: "SENT" } })).toBe(0);
    // Worker tick in the future: due reminders are delivered in-app.
    await dispatchDueReminders(new Date(Date.now() + 4 * 86400_000 - 3600_000));
    expect(await db.reminder.count({ where: { subjectId: r.id, status: { not: "PENDING" } } })).toBeGreaterThan(0);
  });

  it("routes the document through review and approval", async () => {
    await transitionDocument(sara, s.docId!, "UNDER_REVIEW");
    // A DOCUMENTS_ONLY member cannot approve.
    await expect(transitionDocument(omar, s.docId!, "APPROVED")).rejects.toBeTruthy();
    await transitionDocument(owner, s.docId!, "APPROVED", "Looks good");
    const doc = await loadDocumentForUser(owner, s.docId!, "view");
    expect(doc.doc.status).toBe("APPROVED");
    expect(await db.approval.count({ where: { entityId: s.docId, status: "APPROVED" } })).toBe(1);
  });

  it("invoices with VAT, records payment, blocks overpayment", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await saveInvoice(owner, invoiceSchema.parse({ clientId: s.clientId, matterId: s.matterId, issueDate: today, dueDate: today, vatRate: 5, items: [{ description: "Professional fees", quantity: 1, unitPrice: 10000 }] }));
    s.invoiceId = r.id;
    await setInvoiceStatus(owner, r.id, "ISSUED");
    let inv = await db.invoice.findUniqueOrThrow({ where: { id: r.id } });
    expect(inv.total.toString()).toBe("10500");
    await expect(recordPayment(owner, paymentSchema.parse({ invoiceId: r.id, amount: 20000, method: "BANK_TRANSFER", receivedAt: today }))).rejects.toMatchObject({ code: "overpayment" });
    await recordPayment(owner, paymentSchema.parse({ invoiceId: r.id, amount: 10500, method: "BANK_TRANSFER", receivedAt: today }));
    inv = await db.invoice.findUniqueOrThrow({ where: { id: r.id } });
    expect(inv.status).toBe("PAID");
  });

  it("only authorised users can close the case; closing cancels reminders and open tasks", async () => {
    await expect(setMatterStatus(sara, s.matterId!, "CLOSED")).rejects.toBeTruthy();
    await setMatterStatus(owner, s.matterId!, "CLOSED");
    const m = await db.matter.findUniqueOrThrow({ where: { id: s.matterId } });
    expect(m.status).toBe("CLOSED");
    expect(m.closedAt).not.toBeNull();
    expect(await db.reminder.count({ where: { subjectId: s.hearingId, status: "PENDING" } })).toBe(0);
    // Earlier open tasks are cancelled; the closure automation adds exactly one wrap-up task.
    const open = await db.task.findMany({ where: { matterId: s.matterId, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, deletedAt: null }, select: { title: true } });
    expect(open.map((t) => t.title)).toEqual(["Case closure checklist"]);
    expect(await db.task.count({ where: { matterId: s.matterId, status: "CANCELLED" } })).toBeGreaterThan(0);
    expect(await db.approval.count({ where: { matterId: s.matterId, kind: "FINANCIAL" } })).toBe(1);
  });

  it("left a complete, tamper-evident audit trail", async () => {
    const actions = (await db.auditLog.findMany({ where: { matterId: s.matterId }, select: { action: true } })).map((a) => a.action);
    for (const a of ["matter.created", "hearing.created"]) expect(actions).toContain(a);
    expect(actions.some((a) => a.startsWith("document."))).toBe(true);
    expect(actions).toContain("permission.changed");
    expect(actions).toContain("access.denied");
    const chain = await verifyAuditChain(owner.org.id);
    expect(chain.ok).toBe(true);
    // The audit table is append-only at the database level.
    await expect(db.$executeRawUnsafe(`UPDATE \`AuditLog\` SET action = 'x' WHERE \`matterId\` = '${s.matterId}'`)).rejects.toBeTruthy();
    await expect(db.$executeRawUnsafe(`DELETE FROM \`AuditLog\` WHERE \`matterId\` = '${s.matterId}'`)).rejects.toBeTruthy();
  });
});

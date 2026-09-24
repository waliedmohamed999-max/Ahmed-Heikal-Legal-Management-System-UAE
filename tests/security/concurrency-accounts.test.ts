/**
 * Concurrency on MySQL (row locks, unique keys) and account-lifecycle security:
 * case numbering, duplicate / racing payments, invitations, password reset, offboarding.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { StaffContext } from "@/server/auth/session";
import { createMatter } from "@/server/services/matters";
import { saveInvoice, setInvoiceStatus, recordPayment } from "@/server/services/finance";
import { inviteUser, acceptInvitation, resetPassword, offboardUser } from "@/server/auth/account";
import { issueToken, consumeToken } from "@/server/auth/tokens";
import { hashPassword, passwordPolicyError } from "@/server/auth/password";
import { intakeSchema } from "@/lib/schemas";
import { invoiceSchema, paymentSchema } from "@/lib/finance-schemas";
import { ctxFor } from "./helpers";

let owner: StaffContext;
let clientId = "";
const OWNER_PW = "Demo-Password-2026";

beforeAll(async () => {
  owner = await ctxFor("ahmed@demo.ahlegal.test");
  clientId = (await db.client.findFirstOrThrow({ where: { organizationId: owner.org.id, deletedAt: null } })).id;
});
afterAll(async () => {
  await db.$disconnect();
});

describe("case numbering AH-YYYY-XXXXX under concurrency", () => {
  it("12 simultaneous case creations get 12 distinct, well-formed numbers", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => createMatter(owner, intakeSchema.parse({ clientId, kind: "CONSULTATION", title: `Concurrency test ${i}`, conflictStatus: "CLEAR", members: [] }))),
    );
    const numbers = results.map((r) => r.internalNumber);
    expect(new Set(numbers).size).toBe(12);
    for (const n of numbers) expect(n).toMatch(/^AH-\d{4}-\d{5}$/);
  });
});

describe("financial integrity", () => {
  let invoiceId = "";
  beforeAll(async () => {
    const inv = await saveInvoice(owner, invoiceSchema.parse({ clientId, issueDate: "2026-09-24", dueDate: "2026-10-24", vatRate: 5, discount: 0, items: [{ description: "Concurrency test fee", kind: "FEE", quantity: 1, unitPrice: 1000 }] }));
    invoiceId = inv.id;
    await setInvoiceStatus(owner, invoiceId, "ISSUED");
  });

  it("a double-submitted payment (same idempotency key) is recorded once", async () => {
    const key = randomUUID();
    const input = paymentSchema.parse({ invoiceId, amount: 100, method: "BANK_TRANSFER", receivedAt: "2026-09-24", idempotencyKey: key });
    const r = await Promise.all([recordPayment(owner, input), recordPayment(owner, input), recordPayment(owner, input)]);
    expect(new Set(r.map((x) => x.id)).size).toBe(1);
    expect(await db.payment.count({ where: { idempotencyKey: key } })).toBe(1);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(Number(inv.amountPaid)).toBe(100);
  });

  it("racing payments are serialised: no lost update and no overpayment", async () => {
    const inv0 = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const due = Number(inv0.total) - Number(inv0.amountPaid); // 950
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => recordPayment(owner, paymentSchema.parse({ invoiceId, amount: due / 2, method: "CASH", receivedAt: "2026-09-24" }))),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(2);
    expect(attempts.filter((a) => a.status === "rejected").every((a) => /overpayment/.test(String((a as PromiseRejectedResult).reason)))).toBe(true);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const sum = (await db.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } }))._sum.amount;
    expect(Number(inv.amountPaid)).toBe(Number(inv.total));
    expect(Number(sum)).toBe(Number(inv.amountPaid)); // invoice total equals the ledger
    expect(inv.status).toBe("PAID");
  });

  it("an invoice with payments cannot be voided; every change is audited", async () => {
    await expect(setInvoiceStatus(owner, invoiceId, "VOID")).rejects.toThrow(/invalidTransition/);
    expect(await db.auditLog.count({ where: { entityType: "Payment", action: "payment.received", matterId: null } })).toBeGreaterThanOrEqual(3);
  });
});

describe("invitations", () => {
  it("a newer invitation revokes the older one; tokens are single-use and email-bound", async () => {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: owner.org.id, key: "lawyer" } });
    const email = `invitee-${Date.now()}@example.test`;
    const first = await inviteUser(owner, { email, name: "Invitee", roleId: role.id, matterIds: [] });
    await inviteUser(owner, { email, name: "Invitee", roleId: role.id, matterIds: [] });
    expect(first.emailed).toBe(true); // SMTP (Mailpit) configured in tests → e-mailed, link not exposed
    expect(first.link).toBeNull();
    expect(await db.authToken.count({ where: { email, kind: "INVITATION", usedAt: null, revokedAt: null } })).toBe(1);
    expect(await db.authToken.count({ where: { email, kind: "INVITATION", revokedAt: { not: null } } })).toBe(1);
  });

  it("expired and reused tokens are rejected", async () => {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: owner.org.id, key: "lawyer" } });
    const email = `expired-${Date.now()}@example.test`;
    const t = await db.$transaction((tx) => issueToken(tx, { organizationId: owner.org.id, kind: "INVITATION", email, roleId: role.id }));
    await db.authToken.update({ where: { id: t.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await acceptInvitation({ token: t.raw, name: "Late", password: "Strong-Passphrase-4821" })).ok).toBe(false);

    const t2 = await db.$transaction((tx) => issueToken(tx, { organizationId: owner.org.id, kind: "INVITATION", email, roleId: role.id }));
    const again = await db.$transaction((tx) => issueToken(tx, { organizationId: owner.org.id, kind: "INVITATION", email, roleId: role.id }));
    expect((await acceptInvitation({ token: t2.raw, name: "Old", password: "Strong-Passphrase-4821" })).ok).toBe(false); // revoked by newer
    expect((await acceptInvitation({ token: again.raw, name: "Invitee", password: "Strong-Passphrase-4821" })).ok).toBe(true);
    expect((await acceptInvitation({ token: again.raw, name: "Invitee", password: "Strong-Passphrase-4821" })).ok).toBe(false); // single use
    const stored = await db.authToken.findUniqueOrThrow({ where: { id: again.id } });
    expect(stored.tokenHash).not.toBe(again.raw); // only a keyed hash is stored
  });

  it("concurrent consumption of one token: exactly one wins", async () => {
    const t = await db.$transaction((tx) => issueToken(tx, { organizationId: owner.org.id, kind: "PASSWORD_RESET", email: owner.user.email, userId: owner.user.id }));
    const r = await Promise.all([1, 2, 3].map(() => db.$transaction((tx) => consumeToken(tx, "PASSWORD_RESET", t.raw))));
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});

describe("password reset and policy", () => {
  it("rejects weak / common passwords", () => {
    expect(passwordPolicyError("short1")).toBe("passwordTooShort");
    expect(passwordPolicyError("Password2026!!")).toBe("passwordCommon");
    expect(passwordPolicyError("aaaaaaaaaaaa1")).toBe("passwordCommon");
    expect(passwordPolicyError("onlyletterspassphrase")).toBe("passwordWeak");
    expect(passwordPolicyError("Tide-Harbour-Lantern-73")).toBeNull();
  });

  it("a reset link works once and ends every session of the user", async () => {
    const u = await db.user.findFirstOrThrow({ where: { email: "finance@demo.ahlegal.test" } });
    await ctxFor(u.email); // creates an active session
    const t = await db.$transaction((tx) => issueToken(tx, { organizationId: u.organizationId, kind: "PASSWORD_RESET", email: u.email, userId: u.id }));
    expect((await resetPassword(t.raw, "Tide-Harbour-Lantern-73")).ok).toBe(true);
    expect(await db.session.count({ where: { userId: u.id, revokedAt: null } })).toBe(0);
    expect((await resetPassword(t.raw, "Another-Harbour-Lantern-74")).ok).toBe(false);
    // restore the demo password for other suites
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(OWNER_PW) } });
  });
});

describe("offboarding", () => {
  it("disables the user, revokes sessions, transfers open work and keeps history", async () => {
    const role = await db.role.findFirstOrThrow({ where: { organizationId: owner.org.id, key: "lawyer" } });
    const leaver = await db.user.create({ data: { organizationId: owner.org.id, email: `leaver-${Date.now()}@example.test`, name: "Leaver", passwordHash: await hashPassword("Leaver-Passphrase-2026"), roleId: role.id } });
    const m = await createMatter(owner, intakeSchema.parse({ clientId, kind: "CONSULTATION", title: "Offboarding test", conflictStatus: "CLEAR", members: [{ userId: leaver.id, role: "ASSIGNED" }] }));
    await db.matter.update({ where: { id: m.id }, data: { leadLawyerId: leaver.id } });
    const task = await db.task.create({ data: { organizationId: owner.org.id, matterId: m.id, title: "Leaver's task", assigneeId: leaver.id, createdById: owner.user.id } });
    await ctxFor(leaver.email);
    const colleague = await db.user.findFirstOrThrow({ where: { email: "mohamed@demo.ahlegal.test" } });
    await expect(offboardUser(owner, { userId: leaver.id, transferToId: colleague.id, password: "wrong-password", totp: null })).rejects.toThrow(/reauthRequired/);
    const r = await offboardUser(owner, { userId: leaver.id, transferToId: colleague.id, password: OWNER_PW, totp: null });
    expect(r.tasks).toBeGreaterThanOrEqual(1);
    const u = await db.user.findUniqueOrThrow({ where: { id: leaver.id } });
    expect(u.status).toBe("SUSPENDED");
    expect(u.offboardedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: leaver.id, revokedAt: null } })).toBe(0);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId).toBe(colleague.id);
    expect((await db.matter.findUniqueOrThrow({ where: { id: m.id } })).leadLawyerId).toBe(colleague.id);
    expect(await db.matterMember.count({ where: { matterId: m.id, userId: colleague.id } })).toBe(1);
    // History preserved: the user row, their authored task and audit entries still exist.
    expect(await db.task.count({ where: { id: task.id, createdById: owner.user.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "user.offboarded", entityId: leaver.id } })).toBe(1);
  });
});

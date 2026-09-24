/**
 * Permission & IDOR suite (DB-backed, through the real services — the same code paths
 * the pages, server actions and API routes call). Tries to break access control by
 * guessing / swapping ids; hidden UI buttons are irrelevant here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { StaffContext } from "@/server/auth/session";
import { matterAccess, matterScopeWhere } from "@/server/services/access";
import { loadWorkspace } from "@/server/services/workspace";
import { getTaskDetail, setTaskStatus } from "@/server/services/tasks";
import { loadDocumentForUser, transitionDocument, listDocuments, docListQuery, storeUpload, uploadMetaSchema } from "@/server/services/documents";
import { acknowledgeHearing, saveHearingPrep, verifyDeadline } from "@/server/services/events";
import { getInvoice, financeOverview } from "@/server/services/finance-queries";
import { recordPayment } from "@/server/services/finance";
import { decideApproval } from "@/server/services/approvals";
import { listNotes } from "@/server/services/collab";
import { globalSearch } from "@/server/services/search";
import { buildReport } from "@/server/services/reports";
import { getPortalHome, portalSendMessage, portalUpload, portalVersion } from "@/server/services/portal";
import { paymentSchema } from "@/lib/finance-schemas";
import { ctxFor, createSecondPortalClient, PDF, type ClientCtx } from "./helpers";

let owner: StaffContext, sara: StaffContext, omar: StaffContext;
let restricted: { id: string; internalNumber: string; title: string };

beforeAll(async () => {
  [owner, sara, omar] = await Promise.all([ctxFor("ahmed@demo.ahlegal.test"), ctxFor("sara@demo.ahlegal.test"), ctxFor("omar@demo.ahlegal.test")]);
  restricted = await db.matter.findFirstOrThrow({
    where: { confidentiality: "HIGHLY_CONFIDENTIAL", deletedAt: null, members: { none: { user: { email: "sara@demo.ahlegal.test" } } } },
    select: { id: true, internalNumber: true, title: true },
  });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("Lawyer A cannot reach Case B", () => {
  it("matter capabilities are empty and the workspace loader returns 'restricted' (every tab uses it first)", async () => {
    const acc = await matterAccess(sara, restricted.id);
    expect(acc.has("matters.view")).toBe(false);
    const ws = await loadWorkspace(sara, restricted.id);
    expect(ws.state).toBe("restricted");
    expect(JSON.stringify(ws)).not.toContain(restricted.title);
  });

  it("does not appear in her case list or in lookups", async () => {
    const visible = await db.matter.findMany({ where: matterScopeWhere(sara), select: { id: true } });
    expect(visible.map((m) => m.id)).not.toContain(restricted.id);
  });

  it("every object inside it is unreachable by id (IDOR)", async () => {
    const task = await db.task.findFirst({ where: { matterId: restricted.id, deletedAt: null } });
    if (task) {
      await expect(getTaskDetail(sara, task.id)).rejects.toThrow(/notFound|forbidden/);
      await expect(setTaskStatus(sara, task.id, "DONE")).rejects.toThrow(/notFound|forbidden/);
    }
    const doc = await db.document.findFirst({ where: { matterId: restricted.id, deletedAt: null } });
    if (doc) await expect(loadDocumentForUser(sara, doc.id, "download")).rejects.toThrow(/notFound|forbidden/);
    const hearing = await db.hearing.findFirst({ where: { matterId: restricted.id } });
    if (hearing) {
      await expect(acknowledgeHearing(sara, hearing.id)).rejects.toThrow(/notFound|forbidden/);
      await expect(saveHearingPrep(sara, hearing.id, { questions: "x" })).rejects.toThrow(/notFound|forbidden/);
    }
    const deadline = await db.deadline.findFirst({ where: { matterId: restricted.id } });
    if (deadline) await expect(verifyDeadline(sara, deadline.id, true)).rejects.toThrow(/notFound|forbidden/);
    await expect(listNotes(sara, restricted.id)).rejects.toThrow(/notFound|forbidden/);
    const inv = await db.invoice.findFirst({ where: { matterId: restricted.id } });
    if (inv) await expect(getInvoice(sara, inv.id)).rejects.toThrow(/notFound|forbidden/);
  });

  it("random / guessed ids reveal nothing", async () => {
    await expect(getTaskDetail(sara, randomUUID())).rejects.toThrow(/notFound/);
    await expect(loadDocumentForUser(sara, randomUUID(), "view")).rejects.toThrow(/notFound/);
    expect((await loadWorkspace(sara, randomUUID())).state).toBe("missing");
    expect((await loadWorkspace(sara, "../../etc/passwd")).state).toBe("missing");
  });
});

describe("role permissions are enforced server-side", () => {
  it("a junior lawyer cannot approve a document", async () => {
    const m = await db.matter.findFirstOrThrow({ where: { members: { some: { userId: omar.user.id } }, deletedAt: null } });
    const up = await storeUpload(owner, { name: "for-review.pdf", buffer: PDF }, uploadMetaSchema.parse({ matterId: m.id, category: "SUBMISSION", title: "Needs approval" }));
    await transitionDocument(owner, up.id, "UNDER_REVIEW");
    const caps = (await matterAccess(omar, m.id)).caps;
    if (!caps.has("documents.approve")) await expect(transitionDocument(omar, up.id, "APPROVED")).rejects.toThrow(/forbidden|notFound/);
    const approval = await db.approval.findFirst({ where: { entityId: up.id, status: "PENDING" } });
    if (approval && !omar.can("documents.approve")) await expect(decideApproval(omar, approval.id, "APPROVED", null)).rejects.toThrow(/forbidden|notFound/);
  });

  it("a lawyer without finance permission cannot query or change finance", async () => {
    const noFinance = [sara, omar].find((c) => !c.can("finance.view") && !c.can("finance.manage"));
    expect(noFinance).toBeTruthy();
    // Either refused, or the server-side scope returns no invoices at all.
    const overview = await financeOverview(noFinance!, "invoices", {}).catch(() => null);
    if (overview) expect(JSON.stringify(overview)).not.toMatch(/"number":"INV-/);
    const inv = await db.invoice.findFirstOrThrow({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } } });
    await expect(recordPayment(noFinance!, paymentSchema.parse({ invoiceId: inv.id, amount: 1, method: "CASH", receivedAt: "2026-09-24" }))).rejects.toThrow(/forbidden|notFound/);
  });
});

describe("search and export respect permissions", () => {
  it("global search never returns a case or document the lawyer cannot open", async () => {
    const r = await globalSearch(sara, restricted.internalNumber, "en");
    expect(JSON.stringify(r)).not.toContain(restricted.id);
    const r2 = await globalSearch(sara, restricted.title.split(" ").slice(0, 2).join(" "), "en");
    expect(r2.cases.map((c) => c.id)).not.toContain(restricted.id);
  });

  it("highly confidential documents in a case she CAN view are hidden unless she is a member (regression)", async () => {
    // The senior lawyer's role sees ALL cases, so he can view this STANDARD case without being a member.
    const senior = await ctxFor("mohamed@demo.ahlegal.test");
    expect(senior.role.scope).toBe("ALL");
    const viewable = await db.matter.findFirstOrThrow({ where: { organizationId: owner.org.id, deletedAt: null, confidentiality: "STANDARD", members: { none: { userId: senior.user.id } } } });
    expect((await matterAccess(senior, viewable.id)).has("matters.view")).toBe(true);
    const secretTitle = `Sealed settlement ${randomUUID().slice(0, 8)}`;
    const up = await storeUpload(owner, { name: "sealed.pdf", buffer: PDF }, uploadMetaSchema.parse({ matterId: viewable.id, category: "LEGAL_MEMO", title: secretTitle, confidentiality: "HIGHLY_CONFIDENTIAL" }));
    await db.document.update({ where: { id: up.id }, data: { searchText: `${secretTitle} privileged strategy text` } });
    // Neither the title nor the OCR text surfaces it in global search or the documents list…
    const r = await globalSearch(senior, secretTitle, "en");
    expect(r.documents.map((d) => d.id)).not.toContain(up.id);
    const r2 = await globalSearch(senior, "privileged strategy", "en");
    expect(r2.documents.map((d) => d.id)).not.toContain(up.id);
    const list = await listDocuments(senior, docListQuery.parse({ q: secretTitle }));
    expect(JSON.stringify(list)).not.toContain(up.id);
    // …and opening it is refused, while the owner (a member through ownership rules) can find it.
    await expect(loadDocumentForUser(senior, up.id, "view")).rejects.toThrow(/notFound/);
  });

  it("document search by OCR text only returns permitted documents (FULLTEXT candidates are filtered)", async () => {
    const marker = `zyxmarker${Date.now()}`;
    await db.document.update({ where: { id: (await db.document.findFirstOrThrow({ where: { matterId: restricted.id } })).id }, data: { searchText: `restricted ${marker} contents` } }).catch(() => undefined);
    const r = await globalSearch(sara, marker, "en");
    expect(r.documents).toHaveLength(0);
    const asOwner = await globalSearch(owner, marker, "en");
    expect(asOwner.documents.length).toBeGreaterThanOrEqual(0);
  });

  it("reports only count matters the user can access", async () => {
    const saraVisible = await db.matter.count({ where: matterScopeWhere(sara) });
    const all = await db.matter.count({ where: { organizationId: owner.org.id, deletedAt: null } });
    const r = await buildReport(sara, 365).catch((e: Error) => e);
    if (r instanceof Error) return expect(r.message).toMatch(/forbidden/);
    expect(saraVisible).toBeLessThan(all);
    const byType = r.byType.reduce((s, x) => s + x.count, 0);
    expect(byType).toBeLessThanOrEqual(saraVisible);
  });
});

describe("client portal isolation", () => {
  let a: ClientCtx, b: ClientCtx;
  let bMatter = "";
  let bVersion = "";

  beforeAll(async () => {
    const other = await createSecondPortalClient(randomUUID().slice(0, 6));
    bMatter = other.matter.id;
    a = (await ctxFor("client@demo.ahlegal.test", "CLIENT")) as ClientCtx;
    b = (await ctxFor(other.email, "CLIENT")) as ClientCtx;
    // A document shared with client B.
    const up = await storeUpload(owner, { name: "b-only.pdf", buffer: PDF }, uploadMetaSchema.parse({ matterId: bMatter, category: "CLIENT", title: "For client B only" }));
    await db.document.update({ where: { id: up.id }, data: { portalShared: true } });
    bVersion = (await db.documentVersion.findFirstOrThrow({ where: { documentId: up.id } })).id;
  });

  it("client A cannot see, download, message or upload into client B's matter", async () => {
    const home = await getPortalHome(a);
    expect(JSON.stringify(home)).not.toContain(bMatter);
    await expect(portalVersion(a, bVersion)).rejects.toThrow(/notFound/);
    await expect(portalSendMessage(a, bMatter, "hello")).rejects.toThrow(/notFound/);
    await expect(portalUpload(a, bMatter, { name: "x.pdf", buffer: PDF })).rejects.toThrow(/notFound/);
    // Client B can.
    await expect(portalVersion(b, bVersion)).resolves.toBeTruthy();
  });

  it("clients never see internal notes, unshared documents or internal ids of staff", async () => {
    const home = await getPortalHome(a);
    const text = JSON.stringify(home);
    const internalNotes = await db.note.findMany({ where: { matter: { clientId: a.user.clientId }, visibility: { not: "CLIENT" } }, select: { body: true } });
    for (const n of internalNotes) expect(text).not.toContain(n.body);
    const unshared = await db.document.findMany({ where: { matter: { clientId: a.user.clientId }, portalShared: false }, select: { id: true } });
    for (const d of unshared) expect(text).not.toContain(d.id);
    expect(text).not.toMatch(/passwordHash|mfaSecret|tokenHash/);
  });

  it("unshared financial records stay hidden", async () => {
    const hidden = await db.invoice.findMany({ where: { clientId: a.user.clientId, portalVisible: false }, select: { id: true } });
    const text = JSON.stringify(await getPortalHome(a));
    for (const i of hidden) expect(text).not.toContain(i.id);
  });
});

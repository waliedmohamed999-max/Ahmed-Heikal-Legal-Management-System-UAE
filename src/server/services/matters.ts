import { nameSimilarity } from "@/lib/name-similarity";
import "server-only";
import { Prisma, type MatterMemberRole } from "@prisma/client";
import { z } from "zod";
import { db, type Tx, withTxRetry } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit, diff } from "../audit";
import { encryptField } from "../crypto";
import { assertMatter, assertPermission, matterAccess, matterScopeWhere } from "./access";
import { logActivity, timelineEvent } from "./activity";
import { notify } from "./notifications";
import { runAutomations } from "./automation";
import { cancelReminders, syncReminders } from "./reminders";
import { intakeSchema, matterUpdateSchema, timelineSchema } from "@/lib/schemas";
import { fromZonedLocal, zonedParts } from "@/lib/time";

// ─────────────────────────── Numbering ───────────────────────────
/**
 * Atomic per-organisation counter (AH-YYYY-XXXXX, CL-XXXX, invoice numbers).
 * A plain UPDATE on the existing row takes an exclusive row lock (no gap locks), held until
 * the surrounding transaction commits, so concurrent transactions are serialised and never
 * read the same value. `INSERT … ON DUPLICATE KEY UPDATE` was replaced: under concurrency it
 * deadlocks on InnoDB (found by the Phase 11 concurrency test). The row is created once with
 * INSERT IGNORE; callers also retry on deadlock (withTxRetry).
 */
export async function nextCounter(tx: Tx, organizationId: string, key: string) {
  let updated = await tx.$executeRaw`UPDATE \`Counter\` SET \`value\` = \`value\` + 1 WHERE \`organizationId\` = ${organizationId} AND \`key\` = ${key}`;
  if (updated === 0) {
    await tx.$executeRaw`INSERT IGNORE INTO \`Counter\` (\`organizationId\`, \`key\`, \`value\`) VALUES (${organizationId}, ${key}, 0)`;
    updated = await tx.$executeRaw`UPDATE \`Counter\` SET \`value\` = \`value\` + 1 WHERE \`organizationId\` = ${organizationId} AND \`key\` = ${key}`;
  }
  const row = await tx.counter.findUniqueOrThrow({ where: { organizationId_key: { organizationId, key } } });
  return row.value;
}

export async function nextMatterNumber(tx: Tx, orgId: string, prefix: string, tz: string) {
  const year = zonedParts(new Date(), tz).year;
  const n = await nextCounter(tx, orgId, `matter:${year}`);
  return `${prefix}-${year}-${String(n).padStart(5, "0")}`;
}

export async function nextClientNumber(tx: Tx, orgId: string) {
  return `CL-${String(await nextCounter(tx, orgId, "client")).padStart(4, "0")}`;
}

// ─────────────────────────── Listing ───────────────────────────
export const MATTER_VIEWS = ["all", "mine", "active", "pending", "urgent", "closed", "archived", "court", "consultations", "contracts", "disputes", "execution", "appeals", "inactive"] as const;
export type MatterView = (typeof MATTER_VIEWS)[number];

export const matterListQuery = z.object({
  view: z.enum(MATTER_VIEWS).catch("all"),
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  kind: z.string().optional().catch(undefined),
  priority: z.string().optional().catch(undefined),
  lawyer: z.string().uuid().optional().catch(undefined),
  court: z.string().uuid().optional().catch(undefined),
  client: z.string().uuid().optional().catch(undefined),
  sort: z.enum(["activity", "opened", "number", "priority", "title"]).catch("activity"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type MatterListQuery = z.infer<typeof matterListQuery>;

function viewWhere(view: MatterView, userId: string): Prisma.MatterWhereInput {
  switch (view) {
    case "mine": return { members: { some: { userId, role: { in: ["OWNER", "LEAD", "ASSIGNED"] } } }, status: { notIn: ["ARCHIVED"] } };
    case "active": return { status: "ACTIVE" };
    case "pending": return { status: { in: ["PENDING", "ON_HOLD", "INTAKE"] } };
    case "urgent": return { status: { in: ["ACTIVE", "PENDING"] }, priority: { in: ["CRITICAL", "HIGH"] } };
    case "closed": return { status: "CLOSED" };
    case "archived": return { status: "ARCHIVED" };
    case "court": return { kind: "COURT_CASE", status: { notIn: ["ARCHIVED"] } };
    case "consultations": return { kind: "CONSULTATION" };
    case "contracts": return { kind: "CONTRACT" };
    case "disputes": return { kind: { in: ["DISPUTE", "ARBITRATION"] } };
    case "execution": return { kind: "EXECUTION" };
    case "appeals": return { kind: "APPEAL" };
    case "inactive": return { status: "ACTIVE", lastActivityAt: { lt: new Date(Date.now() - 30 * 86400_000) } };
    default: return { status: { notIn: ["ARCHIVED"] } };
  }
}

export const PAGE_SIZE = 25;

export async function listMatters(ctx: StaffContext, q: MatterListQuery) {
  const ci = q.q ? { contains: q.q } : undefined;
  const where: Prisma.MatterWhereInput = {
    AND: [
      matterScopeWhere(ctx),
      viewWhere(q.view, ctx.user.id),
      q.status ? { status: q.status as Prisma.EnumMatterStatusFilter["equals"] } : {},
      q.kind ? { kind: q.kind as Prisma.EnumMatterKindFilter["equals"] } : {},
      q.priority ? { priority: q.priority as Prisma.EnumPriorityFilter["equals"] } : {},
      q.lawyer ? { OR: [{ leadLawyerId: q.lawyer }, { members: { some: { userId: q.lawyer } } }] } : {},
      q.court ? { courtId: q.court } : {},
      q.client ? { clientId: q.client } : {},
      ci ? { OR: [{ title: ci }, { titleAr: ci }, { internalNumber: ci }, { officialCaseNumber: ci }, { client: { OR: [{ nameEn: ci }, { nameAr: ci }] } }] } : {},
    ],
  };
  const orderBy: Prisma.MatterOrderByWithRelationInput =
    q.sort === "opened" ? { openedAt: q.dir } : q.sort === "number" ? { internalNumber: q.dir } : q.sort === "priority" ? { priority: q.dir === "desc" ? "asc" : "desc" } : q.sort === "title" ? { title: q.dir } : { lastActivityAt: q.dir };

  const [total, rows] = await Promise.all([
    db.matter.count({ where }),
    db.matter.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, internalNumber: true, officialCaseNumber: true, title: true, titleAr: true, kind: true, status: true, priority: true, confidentiality: true, riskFlags: true, lastActivityAt: true,
        client: { select: { id: true, nameEn: true, nameAr: true } },
        caseType: { select: { name: true, nameAr: true } },
        court: { select: { name: true, nameAr: true } },
        stage: { select: { name: true, nameAr: true } },
        leadLawyer: { select: { id: true, name: true, nameAr: true, photoUrl: true } },
      },
    }),
  ]);

  // Next event per matter (hearing or open deadline) — two grouped queries, no N+1.
  const ids = rows.map((r) => r.id);
  const now = new Date();
  const [hearings, deadlines] = ids.length
    ? await Promise.all([
        db.hearing.findMany({ where: { matterId: { in: ids }, deletedAt: null, startsAt: { gte: now }, status: { in: ["SCHEDULED", "PREPARING", "READY"] } }, orderBy: { startsAt: "asc" }, select: { matterId: true, startsAt: true, sessionType: true } }),
        db.deadline.findMany({ where: { matterId: { in: ids }, deletedAt: null, status: "OPEN" }, orderBy: { dueAt: "asc" }, select: { matterId: true, dueAt: true, title: true, verification: true } }),
      ])
    : [[], []];
  const nextEvent = new Map<string, { at: string; label: string; kind: "HEARING" | "DEADLINE" }>();
  for (const h of hearings) if (!nextEvent.has(h.matterId)) nextEvent.set(h.matterId, { at: h.startsAt.toISOString(), label: h.sessionType ?? "", kind: "HEARING" });
  for (const d of deadlines) {
    const cur = nextEvent.get(d.matterId!);
    if (!cur || d.dueAt.toISOString() < cur.at) nextEvent.set(d.matterId!, { at: d.dueAt.toISOString(), label: d.title, kind: "DEADLINE" });
  }
  return { total, pageSize: PAGE_SIZE, rows: rows.map((r) => ({ ...r, lastActivityAt: r.lastActivityAt.toISOString(), next: nextEvent.get(r.id) ?? null })) };
}

// ─────────────────────────── Conflict check ───────────────────────────
/**
 * Surfaces *potential* matches only. The system never decides that a conflict
 * exists — an authorised user records the decision on the intake.
 */
export async function conflictCheck(ctx: StaffContext, names: string[]) {
  assertPermission(ctx, "matters.create");
  const terms = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))];
  if (!terms.length) return [];
  const results: {
    term: string;
    type: "CLIENT" | "CONTACT" | "PARTY";
    name: string;
    detail: string | null;
    matter: { id: string | null; internalNumber: string; title: string | null; role: string } | null;
    similarity: number;
  }[] = [];
  const scope = matterScopeWhere(ctx);
  for (const term of terms) {
    // Page through tenant records so approximate matches are not lost to a SQL LIMIT.
    const hits: { id: string; kind: string; name: string; sim: number }[] = [];
    for (const kind of ["CLIENT", "CONTACT"] as const) {
      let cursor: string | undefined;
      for (;;) {
        const args = {
          where: { organizationId: ctx.org.id, deletedAt: null },
          select: { id: true, nameEn: true, nameAr: true, companyName: true },
          orderBy: { id: "asc" as const }, take: 500,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        };
        const batch: { id: string; nameEn: string; nameAr: string | null; companyName: string | null }[] = kind === "CLIENT"
          ? await db.client.findMany(args) : await db.contact.findMany(args);
        for (const row of batch) {
          const sim = Math.max(...[row.nameEn, row.nameAr, row.companyName].map((name) => nameSimilarity(name ?? "", term)));
          if (sim >= 0.3) hits.push({ id: row.id, kind, name: row.nameEn, sim });
        }
        hits.sort((a, b) => b.sim - a.sim);
        hits.splice(25);
        if (batch.length < 500) break;
        cursor = batch[batch.length - 1].id;
      }
    }
    for (const h of hits) {
      if (h.kind === "CLIENT") {
        const matters = await db.matter.findMany({ where: { clientId: h.id, deletedAt: null }, select: { id: true, internalNumber: true, title: true, confidentiality: true } });
        const visible = new Set((await db.matter.findMany({ where: { AND: [scope, { clientId: h.id }] }, select: { id: true } })).map((m) => m.id));
        if (!matters.length) results.push({ term, type: "CLIENT", name: h.name, detail: null, matter: null, similarity: Number(h.sim) });
        for (const m of matters) {
          const can = visible.has(m.id);
          results.push({ term, type: "CLIENT", name: h.name, detail: null, similarity: Number(h.sim), matter: { id: can ? m.id : null, internalNumber: m.internalNumber, title: can ? m.title : null, role: "CLIENT" } });
        }
      } else {
        const parties = await db.matterParty.findMany({ where: { contactId: h.id, matter: { deletedAt: null } }, select: { role: true, matter: { select: { id: true, internalNumber: true, title: true } } } });
        const visible = new Set((await db.matter.findMany({ where: { AND: [scope, { id: { in: parties.map((p) => p.matter.id) } }] }, select: { id: true } })).map((m) => m.id));
        if (!parties.length) results.push({ term, type: "CONTACT", name: h.name, detail: null, matter: null, similarity: Number(h.sim) });
        for (const p of parties) {
          const can = visible.has(p.matter.id);
          results.push({ term, type: "PARTY", name: h.name, detail: null, similarity: Number(h.sim), matter: { id: can ? p.matter.id : null, internalNumber: p.matter.internalNumber, title: can ? p.matter.title : null, role: p.role } });
        }
      }
    }
  }
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "conflict.checked", metadata: { terms, matches: results.length } });
  return results;
}

// ─────────────────────────── Create (intake) ───────────────────────────
export async function createMatter(ctx: StaffContext, input: z.output<typeof intakeSchema>) {
  assertPermission(ctx, "matters.create");
  if (!input.clientId && !input.newClient?.nameEn) throw new AppError("validation", 400, { clientId: "required" });
  if (!input.clientId) assertPermission(ctx, "clients.create");

  const staffIds = [input.leadLawyerId, ...input.members.map((m) => m.userId)].filter(Boolean) as string[];
  if (staffIds.length) {
    const valid = await db.user.count({ where: { id: { in: staffIds }, organizationId: ctx.org.id, kind: "STAFF", status: "ACTIVE" } });
    if (valid !== new Set(staffIds).size) throw new AppError("validation", 400, { members: "invalid" });
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.org.id }, select: { matterPrefix: true } });
  const matter = await withTxRetry(() => db.$transaction(async (tx) => {
    let clientId = input.clientId;
    if (!clientId) {
      const nc = input.newClient!;
      const client = await tx.client.create({
        data: {
          organizationId: ctx.org.id, clientNumber: await nextClientNumber(tx, ctx.org.id), type: nc.type ?? "INDIVIDUAL",
          nameEn: nc.nameEn, nameAr: nc.nameAr || null, email: nc.email || null, phone: nc.phone || null, whatsapp: nc.whatsapp || null,
          preferredLanguage: nc.preferredLanguage ?? "ar", createdById: ctx.user.id,
        },
      });
      clientId = client.id;
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "client.created", entityType: "Client", entityId: client.id, after: { nameEn: client.nameEn } }, tx);
    } else {
      const c = await tx.client.findFirst({ where: { id: clientId, organizationId: ctx.org.id, deletedAt: null } });
      if (!c) throw notFound();
    }

    const workflow = await tx.workflow.findFirst({
      where: { organizationId: ctx.org.id, OR: [{ caseTypeId: input.caseTypeId ?? undefined }, { jurisdictionId: input.jurisdictionId ?? undefined }, { isDefault: true }] },
      orderBy: [{ caseTypeId: "desc" }, { jurisdictionId: "desc" }],
      include: { stages: { orderBy: { order: "asc" }, take: 1 } },
    });

    const internalNumber = await nextMatterNumber(tx, ctx.org.id, org.matterPrefix, ctx.org.timezone);
    const m = await tx.matter.create({
      data: {
        organizationId: ctx.org.id, internalNumber, officialCaseNumber: input.officialCaseNumber, title: input.title, titleAr: input.titleAr,
        summary: input.summary, claims: input.claims, claimAmount: input.claimAmount, kind: input.kind, priority: input.priority,
        confidentiality: input.confidentiality, clientId, caseTypeId: input.caseTypeId, jurisdictionId: input.jurisdictionId, courtId: input.courtId,
        stageId: workflow?.stages[0]?.id, ownerId: ctx.user.id, leadLawyerId: input.leadLawyerId ?? ctx.user.id,
        billingType: input.billingType, feeAmount: input.feeAmount, hourlyRate: input.hourlyRate, feeNotes: input.feeNotes,
        conflictStatus: input.conflictStatus, conflictNotes: input.conflictNotes, conflictCheckedById: ctx.user.id, conflictCheckedAt: new Date(),
        createdById: ctx.user.id, updatedById: ctx.user.id,
      },
    });

    // Team: creator is OWNER; lead lawyer; additional members
    const members = new Map<string, MatterMemberRole>([[ctx.user.id, "OWNER"]]);
    if (input.leadLawyerId && input.leadLawyerId !== ctx.user.id) members.set(input.leadLawyerId, "LEAD");
    for (const mm of input.members) if (!members.has(mm.userId)) members.set(mm.userId, mm.role);
    await tx.matterMember.createMany({ data: [...members].map(([userId, role]) => ({ matterId: m.id, userId, role, grantedById: ctx.user.id })) });

    // Parties (existing contacts or new ones)
    for (const p of input.parties) {
      let contactId = p.contactId;
      if (!contactId) {
        if (!p.nameEn) continue;
        const c = await tx.contact.create({
          data: { organizationId: ctx.org.id, type: p.type, category: p.role === "EXPERT" ? "EXPERT" : p.role === "WITNESS" ? "WITNESS" : p.role === "OPPONENT_COUNSEL" ? "LAWYER" : "OPPONENT", nameEn: p.nameEn, nameAr: p.nameAr, createdById: ctx.user.id },
        });
        contactId = c.id;
      }
      await tx.matterParty.upsert({ where: { matterId_contactId_role: { matterId: m.id, contactId, role: p.role } }, update: {}, create: { matterId: m.id, contactId, role: p.role } });
    }

    // Checklist template for this case type (admin-managed, never assumed universal)
    if (input.applyChecklist && input.caseTypeId) {
      const tpl = await tx.checklistTemplate.findFirst({ where: { organizationId: ctx.org.id, caseTypeId: input.caseTypeId, active: true }, include: { items: { orderBy: { order: "asc" } } } });
      if (tpl) await tx.matterChecklistItem.createMany({ data: tpl.items.map((i) => ({ matterId: m.id, order: i.order, title: i.title, titleAr: i.titleAr, required: i.required })) });
    }

    await timelineEvent(tx, { matterId: m.id, eventType: "CASE_CREATED", title: "Case opened", userId: ctx.user.id });
    await logActivity({ organizationId: ctx.org.id, matterId: m.id, actorId: ctx.user.id, type: "matter.created", entityType: "Matter", entityId: m.id }, tx);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "matter.created", entityType: "Matter", entityId: m.id, matterId: m.id, after: { internalNumber, title: m.title, confidentiality: m.confidentiality, members: Object.fromEntries(members), conflictStatus: input.conflictStatus } }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [...members.keys()], excludeUserId: ctx.user.id, category: "SYSTEM", titleKey: "notif.addedToMatter", params: { number: internalNumber }, link: `/app/cases/${m.id}` }, tx);
    await runAutomations(tx, "matter.created", { organizationId: ctx.org.id, actorId: ctx.user.id, entityId: m.id, matter: { id: m.id, internalNumber, leadLawyerId: m.leadLawyerId, ownerId: m.ownerId } });
    return m;
  }));
  return { id: matter.id, internalNumber: matter.internalNumber };
}

// ─────────────────────────── Update ───────────────────────────
export async function updateMatter(ctx: StaffContext, input: z.output<typeof matterUpdateSchema>) {
  const acc = await assertMatter(ctx, input.id, "matters.edit");
  const before = await db.matter.findUniqueOrThrow({ where: { id: input.id } });

  if (input.confidentiality !== before.confidentiality && !acc.has("matters.manageMembers")) throw forbidden();
  const closing = input.status !== before.status && ["CLOSED", "ARCHIVED"].includes(input.status);
  if (closing && !acc.has("matters.close")) throw forbidden();
  if ((input.billingType !== before.billingType || Number(input.feeAmount ?? 0) !== Number(before.feeAmount ?? 0)) && !acc.has("finance.manage")) {
    // fee terms are financial data — only finance-capable members may change them
    input.billingType = before.billingType;
    input.feeAmount = before.feeAmount == null ? null : Number(before.feeAmount);
    input.hourlyRate = before.hourlyRate == null ? null : Number(before.hourlyRate);
    input.feeNotes = before.feeNotes;
  }

  const { id, ...data } = input;
  const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
  if (!d.changed.length) return { id };

  await db.$transaction(async (tx) => {
    await tx.matter.update({
      where: { id },
      data: { ...data, closedAt: closing ? new Date() : input.status === "ACTIVE" ? null : undefined, updatedById: ctx.user.id },
    });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "matter.updated", entityType: "Matter", entityId: id, matterId: id, before: d.before, after: d.after }, tx);
    await logActivity({ organizationId: ctx.org.id, matterId: id, actorId: ctx.user.id, type: closing ? "matter.closed" : "matter.updated", entityType: "Matter", entityId: id, data: { fields: d.changed.join(", ") } }, tx);
    if (d.changed.includes("stageId") && input.stageId) {
      const st = await tx.workflowStage.findUnique({ where: { id: input.stageId } });
      if (st) await timelineEvent(tx, { matterId: id, eventType: "STAGE_CHANGED", title: `Stage: ${st.name}`, userId: ctx.user.id });
    }
    if (d.changed.includes("status")) await timelineEvent(tx, { matterId: id, eventType: closing ? "CASE_CLOSED" : "STATUS_CHANGED", title: `Status: ${input.status}`, userId: ctx.user.id });
    if (closing) {
      const m = await tx.matter.findUniqueOrThrow({ where: { id }, select: { internalNumber: true, leadLawyerId: true, ownerId: true } });
      await runAutomations(tx, "matter.closed", { organizationId: ctx.org.id, actorId: ctx.user.id, entityId: id, matter: { id, ...m } });
      // Stop every pending reminder attached to this matter's events
      const [hs, ds] = await Promise.all([tx.hearing.findMany({ where: { matterId: id }, select: { id: true } }), tx.deadline.findMany({ where: { matterId: id }, select: { id: true } })]);
      for (const h of hs) await cancelReminders(tx, "HEARING", h.id);
      for (const dd of ds) await cancelReminders(tx, "DEADLINE", dd.id);
    }
    if (d.changed.includes("leadLawyerId") && input.leadLawyerId) {
      await tx.matterMember.upsert({ where: { matterId_userId: { matterId: id, userId: input.leadLawyerId } }, update: { role: "LEAD" }, create: { matterId: id, userId: input.leadLawyerId, role: "LEAD", grantedById: ctx.user.id } });
      // Reminders follow the responsible lawyer
      const [hs, ds] = await Promise.all([tx.hearing.findMany({ where: { matterId: id, deletedAt: null }, select: { id: true } }), tx.deadline.findMany({ where: { matterId: id, deletedAt: null }, select: { id: true } })]);
      for (const h of hs) await syncReminders(tx, "HEARING", h.id);
      for (const dd of ds) await syncReminders(tx, "DEADLINE", dd.id);
    }
  });
  return { id };
}

// ─────────────────────────── Team & access ───────────────────────────
export const memberSchema = z.object({
  matterId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["LEAD", "ASSIGNED", "ASSISTANT", "OBSERVER", "DOCUMENTS_ONLY"]),
  overrides: z.array(z.string().regex(/^[+-][a-zA-Z]+\.[a-zA-Z]+$/)).max(40).default([]),
  expiresAt: z.string().optional().nullable().transform((v, c) => {
    if (!v) return null;
    const d = new Date(v.length === 10 ? `${v}T23:59` : v);
    if (Number.isNaN(d.getTime()) || d < new Date()) {
      c.addIssue({ code: "custom", message: "date" });
      return z.NEVER;
    }
    return d;
  }),
});

export async function upsertMember(ctx: StaffContext, input: z.output<typeof memberSchema>) {
  await assertMatter(ctx, input.matterId, "matters.manageMembers");
  const user = await db.user.findFirst({ where: { id: input.userId, organizationId: ctx.org.id, kind: "STAFF", status: "ACTIVE" } });
  if (!user) throw notFound();
  const before = await db.matterMember.findUnique({ where: { matterId_userId: { matterId: input.matterId, userId: input.userId } } });
  if (before?.role === "OWNER") throw new AppError("ownerImmutable", 400);
  await db.$transaction(async (tx) => {
    const m = await tx.matterMember.upsert({
      where: { matterId_userId: { matterId: input.matterId, userId: input.userId } },
      update: { role: input.role, overrides: input.overrides, expiresAt: input.expiresAt, grantedById: ctx.user.id },
      create: { matterId: input.matterId, userId: input.userId, role: input.role, overrides: input.overrides, expiresAt: input.expiresAt, grantedById: ctx.user.id },
    });
    await audit({
      organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "permission.changed", entityType: "MatterMember", entityId: m.id, matterId: input.matterId,
      before: before ? { role: before.role, overrides: before.overrides, expiresAt: before.expiresAt } : null,
      after: { userId: input.userId, role: input.role, overrides: input.overrides, expiresAt: input.expiresAt },
    }, tx);
    if (!before) {
      const mt = await tx.matter.findUniqueOrThrow({ where: { id: input.matterId }, select: { internalNumber: true } });
      await logActivity({ organizationId: ctx.org.id, matterId: input.matterId, actorId: ctx.user.id, type: "member.added", entityType: "MatterMember", entityId: m.id, data: { name: user.name } }, tx);
      await notify({ organizationId: ctx.org.id, userIds: [input.userId], category: "SYSTEM", titleKey: "notif.addedToMatter", params: { number: mt.internalNumber }, link: `/app/cases/${input.matterId}` }, tx);
    }
  });
  return { ok: true };
}

export async function removeMember(ctx: StaffContext, matterId: string, userId: string) {
  await assertMatter(ctx, matterId, "matters.manageMembers");
  const m = await db.matterMember.findUnique({ where: { matterId_userId: { matterId, userId } } });
  if (!m) throw notFound();
  if (m.role === "OWNER") throw new AppError("ownerImmutable", 400);
  await db.$transaction(async (tx) => {
    await tx.matterMember.delete({ where: { id: m.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "permission.changed", entityType: "MatterMember", entityId: m.id, matterId, before: { userId, role: m.role }, after: null }, tx);
  });
  return { ok: true };
}

export async function requestAccess(ctx: StaffContext, matterId: string, reason: string | null) {
  const acc = await matterAccess(ctx, matterId);
  if (!acc.exists) throw notFound();
  if (acc.has("matters.view")) return { ok: true, already: true };
  const existing = await db.accessRequest.findFirst({ where: { matterId, requesterId: ctx.user.id, status: "PENDING" } });
  if (existing) return { ok: true, pending: true };
  const m = await db.matter.findUniqueOrThrow({ where: { id: matterId }, select: { ownerId: true, leadLawyerId: true, internalNumber: true } });
  await db.$transaction(async (tx) => {
    const r = await tx.accessRequest.create({ data: { organizationId: ctx.org.id, matterId, requesterId: ctx.user.id, reason } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "access.requested", entityType: "AccessRequest", entityId: r.id, matterId }, tx);
    await notify({
      organizationId: ctx.org.id, userIds: [m.ownerId, m.leadLawyerId], category: "SYSTEM", titleKey: "notif.accessRequested",
      params: { name: ctx.user.name, number: m.internalNumber }, link: `/app/approvals?tab=access`, entityType: "AccessRequest", entityId: r.id,
    }, tx);
  });
  return { ok: true, pending: true };
}

export const accessDecisionSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  role: z.enum(["ASSIGNED", "OBSERVER", "DOCUMENTS_ONLY"]).default("OBSERVER"),
  expiresAt: z.string().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export async function decideAccess(ctx: StaffContext, input: z.output<typeof accessDecisionSchema>) {
  const r = await db.accessRequest.findFirst({ where: { id: input.id, organizationId: ctx.org.id, status: "PENDING" }, include: { matter: { select: { internalNumber: true } } } });
  if (!r) throw notFound();
  await assertMatter(ctx, r.matterId, "matters.manageMembers");
  if (input.approve) await upsertMember(ctx, memberSchema.parse({ matterId: r.matterId, userId: r.requesterId, role: input.role, expiresAt: input.expiresAt ?? null, overrides: [] }));
  await db.$transaction(async (tx) => {
    await tx.accessRequest.update({
      where: { id: r.id },
      data: { status: input.approve ? "APPROVED" : "REJECTED", decidedById: ctx.user.id, decidedAt: new Date(), grantedRole: input.approve ? input.role : null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, decisionNote: input.note ?? null },
    });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: input.approve ? "access.granted" : "access.rejected", entityType: "AccessRequest", entityId: r.id, matterId: r.matterId, after: { role: input.role, expiresAt: input.expiresAt } }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [r.requesterId], category: "SYSTEM", titleKey: "notif.accessDecided", params: { number: r.matter.internalNumber, status: input.approve ? "✓" : "✕" }, link: `/app/cases/${r.matterId}` }, tx);
  });
  return { ok: true };
}

// ─────────────────────────── Parties, checklist, timeline ───────────────────────────
export async function addParty(ctx: StaffContext, matterId: string, p: { contactId?: string | null; nameEn?: string | null; nameAr?: string | null; type: "INDIVIDUAL" | "COMPANY"; role: string }) {
  await assertMatter(ctx, matterId, "matters.edit");
  await db.$transaction(async (tx) => {
    let contactId = p.contactId;
    if (contactId) {
      const c = await tx.contact.findFirst({ where: { id: contactId, organizationId: ctx.org.id } });
      if (!c) throw notFound();
    } else {
      if (!p.nameEn) throw new AppError("validation", 400, { nameEn: "required" });
      contactId = (await tx.contact.create({ data: { organizationId: ctx.org.id, type: p.type, category: p.role === "EXPERT" ? "EXPERT" : p.role === "WITNESS" ? "WITNESS" : "OPPONENT", nameEn: p.nameEn, nameAr: p.nameAr, createdById: ctx.user.id } })).id;
    }
    await tx.matterParty.upsert({ where: { matterId_contactId_role: { matterId, contactId, role: p.role as never } }, update: {}, create: { matterId, contactId, role: p.role as never } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "matter.party_added", entityType: "Matter", entityId: matterId, matterId, after: { contactId, role: p.role } }, tx);
  });
}

export async function removeParty(ctx: StaffContext, partyId: string) {
  const p = await db.matterParty.findUnique({ where: { id: partyId } });
  if (!p) throw notFound();
  await assertMatter(ctx, p.matterId, "matters.edit");
  await db.matterParty.delete({ where: { id: partyId } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "matter.party_removed", entityType: "Matter", entityId: p.matterId, matterId: p.matterId, before: { contactId: p.contactId, role: p.role } });
}

export async function toggleChecklistItem(ctx: StaffContext, itemId: string, done: boolean) {
  const item = await db.matterChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound();
  await assertMatter(ctx, item.matterId, "matters.edit");
  await db.matterChecklistItem.update({ where: { id: itemId }, data: { doneAt: done ? new Date() : null, doneById: done ? ctx.user.id : null } });
  await logActivity({ organizationId: ctx.org.id, matterId: item.matterId, actorId: ctx.user.id, type: "matter.updated", entityType: "Checklist", entityId: itemId, data: { fields: item.title } });
}

export async function addChecklistItem(ctx: StaffContext, matterId: string, title: string) {
  await assertMatter(ctx, matterId, "matters.edit");
  const max = await db.matterChecklistItem.aggregate({ where: { matterId }, _max: { order: true } });
  await db.matterChecklistItem.create({ data: { matterId, title, order: (max._max.order ?? 0) + 1 } });
}

export async function addTimelineEvent(ctx: StaffContext, input: z.output<typeof timelineSchema>) {
  await assertMatter(ctx, input.matterId, "matters.edit");
  const e = await db.timelineEvent.create({
    data: { matterId: input.matterId, eventType: input.eventType, title: input.title, description: input.description, notes: input.notes, occurredAt: fromZonedLocal(input.occurredAt, ctx.org.timezone), documentIds: input.documentIds, userId: ctx.user.id, source: "MANUAL" },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "timeline.added", entityType: "TimelineEvent", entityId: e.id, matterId: input.matterId, after: { title: e.title } });
  return e;
}

/** Approve / edit / reject an AI- or import-proposed timeline event. Nothing proposed becomes official without a human. */
export async function decideTimelineEvent(ctx: StaffContext, id: string, decision: "CONFIRMED" | "REJECTED", edits?: { title?: string; occurredAt?: string }) {
  const e = await db.timelineEvent.findUnique({ where: { id } });
  if (!e || e.status !== "PROPOSED") throw notFound();
  await assertMatter(ctx, e.matterId, "matters.edit");
  await db.timelineEvent.update({
    where: { id },
    data: { status: decision, decidedById: ctx.user.id, title: edits?.title ?? undefined, occurredAt: edits?.occurredAt ? fromZonedLocal(edits.occurredAt, ctx.org.timezone) : undefined },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: `timeline.${decision === "CONFIRMED" ? "approved" : "rejected"}`, entityType: "TimelineEvent", entityId: id, matterId: e.matterId });
}

export async function recordMatterView(ctx: StaffContext, matterId: string) {
  // Throttled: one "viewed" audit row per user per matter per 30 minutes
  const recent = await db.auditLog.findFirst({ where: { actorId: ctx.user.id, action: "matter.viewed", entityId: matterId, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
  if (!recent) await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "matter.viewed", entityType: "Matter", entityId: matterId, matterId });
}

export { Prisma };

/** Status change (e.g. close) reuses the full update path: permissions, audit, automations, reminders. */
export async function setMatterStatus(ctx: StaffContext, id: string, status: "ACTIVE" | "CLOSED" | "ARCHIVED" | "PENDING" | "ON_HOLD") {
  const m = await db.matter.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!m) throw notFound();
  await updateMatter(ctx, matterUpdateSchema.parse({
    id, status, title: m.title, titleAr: m.titleAr ?? "", officialCaseNumber: m.officialCaseNumber ?? "", kind: m.kind, priority: m.priority, confidentiality: m.confidentiality,
    caseTypeId: m.caseTypeId ?? "", jurisdictionId: m.jurisdictionId ?? "", courtId: m.courtId ?? "", stageId: m.stageId ?? "", leadLawyerId: m.leadLawyerId ?? "",
    summary: m.summary ?? "", claims: m.claims ?? "", claimAmount: m.claimAmount == null ? undefined : Number(m.claimAmount), currentStatusText: m.currentStatusText ?? "",
    lastActionText: m.lastActionText ?? "", nextActionText: m.nextActionText ?? "", internalNotes: m.internalNotes ?? "", riskFlags: m.riskFlags as never,
    billingType: m.billingType, feeAmount: m.feeAmount == null ? undefined : Number(m.feeAmount), hourlyRate: m.hourlyRate == null ? undefined : Number(m.hourlyRate),
    feeNotes: m.feeNotes ?? "", portalEnabled: m.portalEnabled, portalStatusText: m.portalStatusText ?? "",
  }));
}

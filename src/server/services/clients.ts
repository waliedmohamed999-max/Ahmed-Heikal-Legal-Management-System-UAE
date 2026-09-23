import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { notFound } from "../errors";
import { audit, diff } from "../audit";
import { decryptField, encryptField, maskValue } from "../crypto";
import { assertPermission, matterScopeWhere } from "./access";
import { nextClientNumber } from "./matters";
import { clientSchema, contactSchema } from "@/lib/schemas";

export const clientListQuery = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(["INDIVIDUAL", "COMPANY"]).optional().catch(undefined),
  status: z.enum(["ACTIVE", "INACTIVE", "PROSPECT"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export async function listClients(ctx: StaffContext, q: z.infer<typeof clientListQuery>) {
  assertPermission(ctx, "clients.view");
  const ci = q.q ? { contains: q.q, mode: "insensitive" as const } : undefined;
  const where: Prisma.ClientWhereInput = {
    organizationId: ctx.org.id, deletedAt: null, type: q.type, status: q.status,
    ...(ci ? { OR: [{ nameEn: ci }, { nameAr: ci }, { clientNumber: ci }, { email: ci }, { phone: ci }, { companyName: ci }] } : {}),
  };
  const scope = matterScopeWhere(ctx);
  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * 25, take: 25,
      select: {
        id: true, clientNumber: true, type: true, nameEn: true, nameAr: true, email: true, phone: true, status: true, lastContactAt: true, preferredLanguage: true,
        _count: { select: { matters: { where: { AND: [scope, { status: { in: ["ACTIVE", "PENDING", "INTAKE", "ON_HOLD"] } }] } } } },
      },
    }),
  ]);
  let outstanding = new Map<string, number>();
  if (ctx.can("finance.view") && rows.length) {
    const inv = await db.invoice.groupBy({ by: ["clientId"], where: { clientId: { in: rows.map((r) => r.id) }, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, deletedAt: null }, _sum: { total: true, amountPaid: true } });
    outstanding = new Map(inv.map((i) => [i.clientId, Number(i._sum.total ?? 0) - Number(i._sum.amountPaid ?? 0)]));
  }
  return { total, rows: rows.map((r) => ({ ...r, lastContactAt: r.lastContactAt?.toISOString() ?? null, activeMatters: r._count.matters, outstanding: outstanding.get(r.id) ?? null })) };
}

/** Client 360. Sensitive identifiers are masked unless the viewer holds clients.viewSensitive. */
export async function getClient360(ctx: StaffContext, id: string) {
  assertPermission(ctx, "clients.view");
  const c = await db.client.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null }, include: { contacts: { where: { deletedAt: null } }, portalUsers: { select: { id: true, email: true, status: true, lastLoginAt: true } } } });
  if (!c) throw notFound();
  const scope = matterScopeWhere(ctx);
  const now = new Date();
  const [matters, hiddenMatters, tasks, documents, appointments, communications, invoices, activity] = await Promise.all([
    db.matter.findMany({
      where: { AND: [scope, { clientId: id }] }, orderBy: { lastActivityAt: "desc" },
      select: { id: true, internalNumber: true, title: true, titleAr: true, status: true, priority: true, kind: true, lastActivityAt: true, leadLawyer: { select: { name: true, nameAr: true } } },
    }),
    db.matter.count({ where: { clientId: id, deletedAt: null, NOT: scope } }),
    db.task.findMany({ where: { deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, matter: { AND: [scope, { clientId: id }] } }, orderBy: { dueAt: "asc" }, take: 10, select: { id: true, title: true, dueAt: true, priority: true, status: true, matter: { select: { internalNumber: true } } } }),
    ctx.can("documents.view")
      ? db.document.findMany({ where: { deletedAt: null, OR: [{ clientId: id, matterId: null }, { matter: { AND: [scope, { clientId: id }] } }] }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, title: true, category: true, status: true, updatedAt: true, matter: { select: { internalNumber: true } } } })
      : [],
    db.appointment.findMany({ where: { clientId: id, deletedAt: null, startsAt: { gte: new Date(now.getTime() - 30 * 86400_000) } }, orderBy: { startsAt: "asc" }, take: 10, select: { id: true, title: true, type: true, startsAt: true, status: true } }),
    db.communication.findMany({ where: { clientId: id, OR: [{ matterId: null }, { matter: scope }] }, orderBy: { occurredAt: "desc" }, take: 10 }),
    ctx.can("finance.view") ? db.invoice.findMany({ where: { clientId: id, deletedAt: null }, orderBy: { issueDate: "desc" }, take: 10, select: { id: true, number: true, status: true, total: true, amountPaid: true, dueDate: true } }) : [],
    db.activity.findMany({ where: { matter: { AND: [scope, { clientId: id }] } }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true, nameAr: true } }, matter: { select: { internalNumber: true } } } }),
  ]);
  const sensitive = ctx.can("clients.viewSensitive");
  const outstanding = invoices.filter((i) => ["ISSUED", "PARTIALLY_PAID"].includes(i.status)).reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0);
  return {
    client: {
      ...c,
      emiratesIdEnc: undefined, passportEnc: undefined,
      emiratesId: c.emiratesIdEnc ? (sensitive ? "__hidden__" : maskValue("••••••••")) : null,
      passportNo: c.passportEnc ? (sensitive ? "__hidden__" : maskValue("••••••")) : null,
      hasSensitive: !!(c.emiratesIdEnc || c.passportEnc),
    },
    canViewSensitive: sensitive,
    matters, hiddenMatters, tasks, documents, appointments, communications, activity,
    invoices: invoices.map((i) => ({ ...i, total: Number(i.total), amountPaid: Number(i.amountPaid) })),
    outstanding: ctx.can("finance.view") ? outstanding : null,
  };
}

/** Reveal sensitive identifiers on explicit request; every reveal is audited. */
export async function revealClientSensitive(ctx: StaffContext, id: string) {
  assertPermission(ctx, "clients.viewSensitive");
  const c = await db.client.findFirst({ where: { id, organizationId: ctx.org.id }, select: { emiratesIdEnc: true, passportEnc: true } });
  if (!c) throw notFound();
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "client.sensitive_viewed", entityType: "Client", entityId: id });
  return { emiratesId: decryptField(c.emiratesIdEnc), passportNo: decryptField(c.passportEnc) };
}

export async function createClient(ctx: StaffContext, input: z.output<typeof clientSchema>) {
  assertPermission(ctx, "clients.create");
  const { emiratesId, passportNo, ...rest } = input;
  const canSensitive = ctx.can("clients.viewSensitive");
  return db.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: {
        ...rest, organizationId: ctx.org.id, clientNumber: await nextClientNumber(tx, ctx.org.id), createdById: ctx.user.id, updatedById: ctx.user.id,
        emiratesIdEnc: canSensitive ? encryptField(emiratesId) : null, passportEnc: canSensitive ? encryptField(passportNo) : null,
      },
    });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "client.created", entityType: "Client", entityId: c.id, after: { ...rest, emiratesId: emiratesId ? "[set]" : null } }, tx);
    return { id: c.id };
  });
}

export async function updateClient(ctx: StaffContext, id: string, input: z.output<typeof clientSchema>) {
  assertPermission(ctx, "clients.edit");
  const before = await db.client.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!before) throw notFound();
  const { emiratesId, passportNo, ...rest } = input;
  const sensitiveData: Prisma.ClientUpdateInput = {};
  if (ctx.can("clients.viewSensitive")) {
    // Empty input keeps the stored value; the UI never receives the plaintext unless revealed.
    if (emiratesId && emiratesId !== "__keep__") sensitiveData.emiratesIdEnc = encryptField(emiratesId);
    if (passportNo && passportNo !== "__keep__") sensitiveData.passportEnc = encryptField(passportNo);
  }
  const d = diff(before as unknown as Record<string, unknown>, rest as unknown as Record<string, unknown>);
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { ...rest, ...sensitiveData, updatedById: ctx.user.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "client.updated", entityType: "Client", entityId: id, before: d.before, after: { ...d.after, ...(Object.keys(sensitiveData).length ? { sensitive: "[changed]" } : {}) } }, tx);
  });
  return { id };
}

export async function deleteClient(ctx: StaffContext, id: string) {
  assertPermission(ctx, "clients.delete");
  const active = await db.matter.count({ where: { clientId: id, deletedAt: null, status: { notIn: ["CLOSED", "ARCHIVED"] } } });
  if (active) throw new (await import("../errors")).AppError("clientHasActiveMatters", 400);
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.user.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "client.deleted", entityType: "Client", entityId: id }, tx);
  });
}

// ─────────────────────────── Contacts ───────────────────────────
export async function listContacts(ctx: StaffContext, q: { q?: string; category?: string; page: number }) {
  assertPermission(ctx, "contacts.view");
  const ci = q.q ? { contains: q.q, mode: "insensitive" as const } : undefined;
  const where: Prisma.ContactWhereInput = {
    organizationId: ctx.org.id, deletedAt: null,
    ...(q.category ? { category: q.category as never } : {}),
    ...(ci ? { OR: [{ nameEn: ci }, { nameAr: ci }, { companyName: ci }, { email: ci }, { phone: ci }] } : {}),
  };
  const scope = matterScopeWhere(ctx);
  const [total, rows] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where, orderBy: { nameEn: "asc" }, skip: (q.page - 1) * 30, take: 30,
      include: {
        client: { select: { id: true, nameEn: true, nameAr: true } },
        parties: { where: { matter: scope }, select: { role: true, matter: { select: { id: true, internalNumber: true } } } },
        relationsFrom: { include: { to: { select: { id: true, nameEn: true, nameAr: true } } } },
        relationsTo: { include: { from: { select: { id: true, nameEn: true, nameAr: true } } } },
      },
    }),
  ]);
  return { total, rows };
}

export async function saveContact(ctx: StaffContext, id: string | null, input: z.output<typeof contactSchema>) {
  assertPermission(ctx, "contacts.manage");
  if (input.clientId) {
    const c = await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.org.id } });
    if (!c) throw notFound();
  }
  if (id) {
    const before = await db.contact.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
    if (!before) throw notFound();
    const d = diff(before as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
    await db.contact.update({ where: { id }, data: input });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "contact.updated", entityType: "Contact", entityId: id, before: d.before, after: d.after });
    return { id };
  }
  const c = await db.contact.create({ data: { ...input, organizationId: ctx.org.id, createdById: ctx.user.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "contact.created", entityType: "Contact", entityId: c.id, after: { nameEn: c.nameEn, category: c.category } });
  return { id: c.id };
}

export async function addContactRelation(ctx: StaffContext, fromId: string, toId: string, label: string) {
  assertPermission(ctx, "contacts.manage");
  const n = await db.contact.count({ where: { id: { in: [fromId, toId] }, organizationId: ctx.org.id } });
  if (n !== 2 || fromId === toId) throw notFound();
  await db.contactRelation.upsert({ where: { fromId_toId_label: { fromId, toId, label } }, update: {}, create: { fromId, toId, label } });
}

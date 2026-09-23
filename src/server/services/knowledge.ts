import "server-only";
import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import type { StaffContext } from "@/server/auth/session";
import { assertMatter, assertPermission, AppError } from "./access";
import { renderTemplate, type generateSchema, type knowledgeSchema, type templateSchema, type PlaceholderKey } from "@/lib/templates";
import { formatDateTime } from "@/lib/time";

const tagsOf = (s?: string) => [...new Set((s ?? "").split(/[,،]/).map((x) => x.trim()).filter(Boolean))].slice(0, 20);

/** Confidential entries are visible to their author and to knowledge managers only. */
export function knowledgeScope(ctx: StaffContext): Prisma.KnowledgeDocumentWhereInput {
  const base = { organizationId: ctx.org.id, deletedAt: null };
  if (ctx.can("knowledge.manage")) return base;
  return { ...base, OR: [{ confidentiality: "STANDARD" }, { authorId: ctx.user.id }] };
}

export async function listKnowledge(ctx: StaffContext, q?: string, kind?: string) {
  assertPermission(ctx, "knowledge.view");
  const and: Prisma.KnowledgeDocumentWhereInput[] = [knowledgeScope(ctx)];
  if (kind) and.push({ kind });
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }, { tags: { has: q } }] });
  return db.knowledgeDocument.findMany({ where: { AND: and }, orderBy: { updatedAt: "desc" }, take: 200 });
}

export async function saveKnowledge(ctx: StaffContext, { id, tags, ...d }: z.output<typeof knowledgeSchema>) {
  assertPermission(ctx, "knowledge.manage");
  const data = { ...d, tags: tagsOf(tags) };
  const r = id
    ? await db.knowledgeDocument.update({ where: { id, organizationId: ctx.org.id }, data })
    : await db.knowledgeDocument.create({ data: { ...data, organizationId: ctx.org.id, authorId: ctx.user.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: id ? "knowledge.updated" : "knowledge.created", entityType: "KnowledgeDocument", entityId: r.id, after: { title: r.title, kind: r.kind } });
  return r;
}

export async function deleteKnowledge(ctx: StaffContext, id: string) {
  assertPermission(ctx, "knowledge.manage");
  await db.knowledgeDocument.updateMany({ where: { id, organizationId: ctx.org.id }, data: { deletedAt: new Date() } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "knowledge.deleted", entityType: "KnowledgeDocument", entityId: id });
}

export async function saveTemplate(ctx: StaffContext, { id, ...d }: z.output<typeof templateSchema>) {
  assertPermission(ctx, "knowledge.manage");
  const r = id
    ? await db.template.update({ where: { id, organizationId: ctx.org.id }, data: d })
    : await db.template.create({ data: { ...d, organizationId: ctx.org.id, createdById: ctx.user.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: id ? "template.updated" : "template.created", entityType: "Template", entityId: r.id, after: { name: r.name, kind: r.kind } });
  return r;
}

export async function deleteTemplate(ctx: StaffContext, id: string) {
  assertPermission(ctx, "knowledge.manage");
  await db.template.deleteMany({ where: { id, organizationId: ctx.org.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "template.deleted", entityType: "Template", entityId: id });
}

/** Fill a template from a case the user can view. Produces a draft only — nothing is sent or filed. */
export async function generateFromTemplate(ctx: StaffContext, { templateId, matterId }: z.output<typeof generateSchema>) {
  assertPermission(ctx, "knowledge.view");
  await assertMatter(ctx, matterId, "matters.view");
  const [tpl, m] = await Promise.all([
    db.template.findFirst({ where: { id: templateId, organizationId: ctx.org.id } }),
    db.matter.findFirst({
      where: { id: matterId, organizationId: ctx.org.id },
      select: {
        internalNumber: true, officialCaseNumber: true, title: true, titleAr: true, status: true,
        client: { select: { nameEn: true, nameAr: true, clientNumber: true } },
        court: { select: { name: true, nameAr: true } },
        leadLawyer: { select: { name: true } },
        owner: { select: { name: true } },
        hearings: { where: { startsAt: { gte: new Date() }, status: { in: ["SCHEDULED", "PREPARING", "READY"] } }, orderBy: { startsAt: "asc" }, take: 1, select: { startsAt: true } },
      },
    }),
  ]);
  if (!tpl || !m) throw new AppError("notFound", 404);
  const ar = tpl.locale === "ar";
  const tz = ctx.org.timezone;
  const values: Partial<Record<PlaceholderKey, string | null>> = {
    "client.name": ar ? (m.client.nameAr ?? m.client.nameEn) : m.client.nameEn,
    "client.nameAr": m.client.nameAr,
    "client.number": m.client.clientNumber,
    "matter.number": m.internalNumber,
    "matter.title": ar ? (m.titleAr ?? m.title) : m.title,
    "matter.titleAr": m.titleAr,
    "matter.officialNumber": m.officialCaseNumber,
    "matter.court": m.court ? (ar ? (m.court.nameAr ?? m.court.name) : m.court.name) : null,
    "matter.status": m.status,
    "hearing.next": m.hearings[0] ? formatDateTime(m.hearings[0].startsAt, tpl.locale as "ar" | "en", tz) : null,
    "lawyer.name": m.leadLawyer?.name ?? m.owner.name,
    "office.name": ctx.org.name,
    "office.nameAr": ctx.org.nameAr,
    today: new Intl.DateTimeFormat(ar ? "ar-AE" : "en-GB", { dateStyle: "long", timeZone: tz }).format(new Date()),
  };
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "template.generated", entityType: "Template", entityId: tpl.id, matterId });
  return { ...renderTemplate(tpl.body, values), locale: tpl.locale };
}

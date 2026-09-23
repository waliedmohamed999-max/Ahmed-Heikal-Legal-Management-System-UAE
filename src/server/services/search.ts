import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { matterScopeWhere } from "./access";

const LIMIT = 6;

function snippet(text: string | null, q: string) {
  if (!text) return null;
  const i = text.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0]);
  if (i < 0) return null;
  const start = Math.max(0, i - 40);
  return (start > 0 ? "…" : "") + text.slice(start, i + 80).replace(/\s+/g, " ").trim() + "…";
}

/** Documents visible to the user: inside an accessible matter, not denied, or client-level docs for client viewers. */
export function documentScopeWhere(ctx: StaffContext): Prisma.DocumentWhereInput {
  if (!ctx.can("documents.view")) return { id: { in: [] } };
  return {
    organizationId: ctx.org.id,
    deletedAt: null,
    permissions: { none: { access: "DENY", OR: [{ userId: ctx.user.id }, { roleId: ctx.role.id }] } },
    OR: [{ matter: matterScopeWhere(ctx) }, ...(ctx.can("clients.view") ? [{ matterId: null, confidentiality: "STANDARD" as const }] : [])],
  };
}

/** Global search (⌘K). Every group applies the same access rules as its module. */
export async function globalSearch(ctx: StaffContext, raw: string, locale: "ar" | "en") {
  const q = raw.trim().slice(0, 100);
  const ci = { contains: q, mode: "insensitive" as const };
  const scope = matterScopeWhere(ctx);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);

  // Full-text candidates from extracted/OCR document text (GIN index), access-filtered afterwards.
  const ftsIds = ctx.can("documents.view")
    ? await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Document"
        WHERE "organizationId" = ${ctx.org.id}::uuid AND "deletedAt" IS NULL
          AND to_tsvector('simple', coalesce("searchText", '')) @@ plainto_tsquery('simple', ${q})
        LIMIT 40`
    : [];

  const [cases, clients, contacts, documents, tasks, invoices] = await Promise.all([
    db.matter.findMany({
      where: { AND: [scope, { OR: [{ title: ci }, { titleAr: ci }, { internalNumber: ci }, { officialCaseNumber: ci }, { client: { OR: [{ nameEn: ci }, { nameAr: ci }] } }, { parties: { some: { contact: { OR: [{ nameEn: ci }, { nameAr: ci }] } } } }] }] },
      select: { id: true, internalNumber: true, title: true, titleAr: true, officialCaseNumber: true, client: { select: { nameEn: true, nameAr: true } } },
      orderBy: { lastActivityAt: "desc" },
      take: LIMIT,
    }),
    ctx.can("clients.view")
      ? db.client.findMany({
          where: { organizationId: ctx.org.id, deletedAt: null, OR: [{ nameEn: ci }, { nameAr: ci }, { clientNumber: ci }, { email: ci }, { companyName: ci }] },
          select: { id: true, nameEn: true, nameAr: true, clientNumber: true },
          take: LIMIT,
        })
      : [],
    ctx.can("contacts.view")
      ? db.contact.findMany({
          where: { organizationId: ctx.org.id, deletedAt: null, OR: [{ nameEn: ci }, { nameAr: ci }, { companyName: ci }, { email: ci }] },
          select: { id: true, nameEn: true, nameAr: true, category: true },
          take: LIMIT,
        })
      : [],
    db.document.findMany({
      where: { AND: [documentScopeWhere(ctx), { OR: [{ title: ci }, { tags: { has: q } }, { description: ci }, { id: { in: ftsIds.map((r) => r.id) } }] }] },
      select: { id: true, title: true, matterId: true, searchText: true, matter: { select: { internalNumber: true } } },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
    }),
    ctx.can("tasks.view")
      ? db.task.findMany({
          where: {
            organizationId: ctx.org.id, deletedAt: null, title: ci,
            OR: [{ matter: scope }, { matterId: null, OR: [{ assigneeId: ctx.user.id }, { createdById: ctx.user.id }] }],
          },
          select: { id: true, title: true, matter: { select: { internalNumber: true } } },
          take: LIMIT,
        })
      : [],
    ctx.can("finance.view")
      ? db.invoice.findMany({
          where: { organizationId: ctx.org.id, deletedAt: null, OR: [{ number: ci }, { client: { OR: [{ nameEn: ci }, { nameAr: ci }] } }] },
          select: { id: true, number: true, client: { select: { nameEn: true, nameAr: true } } },
          take: LIMIT,
        })
      : [],
  ]);

  return {
    cases: cases.map((m) => ({ id: m.id, title: `${m.internalNumber} · ${L(m.title, m.titleAr)}`, subtitle: [L(m.client.nameEn, m.client.nameAr), m.officialCaseNumber].filter(Boolean).join(" · "), href: `/app/cases/${m.id}` })),
    clients: clients.map((c) => ({ id: c.id, title: L(c.nameEn, c.nameAr), subtitle: c.clientNumber, href: `/app/clients/${c.id}` })),
    contacts: contacts.map((c) => ({ id: c.id, title: L(c.nameEn, c.nameAr), subtitle: c.category, href: `/app/contacts?focus=${c.id}` })),
    documents: documents.map((d) => ({
      id: d.id, title: d.title, subtitle: d.matter?.internalNumber ?? null,
      snippet: d.title.toLowerCase().includes(q.toLowerCase()) ? null : snippet(d.searchText, q),
      href: `/app/documents/${d.id}`,
    })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, subtitle: t.matter?.internalNumber ?? null, href: `/app/tasks?task=${t.id}` })),
    invoices: invoices.map((i) => ({ id: i.id, title: i.number, subtitle: L(i.client.nameEn, i.client.nameAr), href: `/app/finance/invoices/${i.id}` })),
  };
}

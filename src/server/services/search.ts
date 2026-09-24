import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { matterScopeWhere } from "./access";
import { documentScope } from "./documents";
import { fulltextDocumentIds } from "./fulltext";

const LIMIT = 6;

function snippet(text: string | null, q: string) {
  if (!text) return null;
  const i = text.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0]);
  if (i < 0) return null;
  const start = Math.max(0, i - 40);
  return (start > 0 ? "…" : "") + text.slice(start, i + 80).replace(/\s+/g, " ").trim() + "…";
}

// Documents use the single strict scope from the documents module (incl. the rule that highly
// confidential documents need explicit case membership) — never a looser copy.

/** Global search (⌘K). Every group applies the same access rules as its module. */
export async function globalSearch(ctx: StaffContext, raw: string, locale: "ar" | "en") {
  const q = raw.trim().slice(0, 100);
  const ci = { contains: q };
  const scope = matterScopeWhere(ctx);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  // Full-text candidates (ids only); the permission filter is applied in the same query below.
  const ftIds = ctx.can("documents.view") ? await fulltextDocumentIds(ctx.org.id, q) : [];
  const docMatch: Prisma.DocumentWhereInput =
    ftIds === null
      ? { OR: [{ title: ci }, { tags: { array_contains: q } }] } // short query: explicit title/tag fallback
      : { OR: [{ id: { in: ftIds } }, { tags: { array_contains: q } }, { description: ci }] };

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
      where: { AND: [documentScope(ctx), docMatch] },
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

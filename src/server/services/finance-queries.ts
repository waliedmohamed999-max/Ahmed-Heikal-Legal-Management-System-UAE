import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { notFound } from "../errors";
import { matterScopeWhere, matterAccess } from "./access";

/** Invoices visible to the user: all for finance-scope roles, otherwise only those of accessible matters. */
export function invoiceScope(ctx: StaffContext): Prisma.InvoiceWhereInput {
  if (!ctx.can("finance.view")) return { id: { in: [] } };
  const base = { organizationId: ctx.org.id, deletedAt: null };
  return ctx.principal.scope === "ASSIGNED" ? { ...base, matter: matterScopeWhere(ctx) } : base;
}

export async function financeOverview(ctx: StaffContext, tab: string, q: { status?: string; client?: string }) {
  const scope = invoiceScope(ctx);
  const now = new Date();
  const invoices = tab === "invoices" || tab === "overview"
    ? await db.invoice.findMany({
        where: { AND: [scope, q.status === "OVERDUE" ? { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } } : q.status ? { status: q.status as never } : {}, q.client ? { clientId: q.client } : {}] },
        orderBy: { issueDate: "desc" }, take: tab === "overview" ? 8 : 200,
        include: { client: { select: { id: true, nameEn: true, nameAr: true } }, matter: { select: { id: true, internalNumber: true } } },
      })
    : [];
  const payments = tab === "payments" || tab === "overview"
    ? await db.payment.findMany({ where: { invoice: scope }, orderBy: { receivedAt: "desc" }, take: tab === "overview" ? 6 : 200, include: { invoice: { select: { id: true, number: true, client: { select: { nameEn: true, nameAr: true } } } } } })
    : [];
  const expenses = tab === "expenses"
    ? await db.expense.findMany({ where: { organizationId: ctx.org.id, deletedAt: null, ...(ctx.principal.scope === "ASSIGNED" ? { matter: matterScopeWhere(ctx) } : {}) }, orderBy: { incurredAt: "desc" }, take: 200, include: { matter: { select: { id: true, internalNumber: true } }, invoiceItem: { select: { id: true } } } })
    : [];
  const time = tab === "time"
    ? await db.timeEntry.findMany({
        where: { organizationId: ctx.org.id, deletedAt: null, ...(ctx.can("time.viewAll") ? (ctx.principal.scope === "ASSIGNED" ? { matter: matterScopeWhere(ctx) } : {}) : { userId: ctx.user.id }) },
        orderBy: { startedAt: "desc" }, take: 200, include: { matter: { select: { id: true, internalNumber: true } }, user: { select: { name: true, nameAr: true } }, invoiceItem: { select: { id: true } } },
      })
    : [];
  return { invoices, payments, expenses, time };
}

export async function getInvoice(ctx: StaffContext, id: string) {
  const inv = await db.invoice.findFirst({
    where: { AND: [invoiceScope(ctx), { id }] },
    include: {
      client: true, matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } }, items: { orderBy: { order: "asc" } },
      payments: { orderBy: { receivedAt: "desc" } }, organization: true,
    },
  });
  if (!inv) throw notFound();
  if (inv.matterId && ctx.principal.scope === "ASSIGNED" && !(await matterAccess(ctx, inv.matterId)).has("finance.view")) throw notFound();
  return inv;
}

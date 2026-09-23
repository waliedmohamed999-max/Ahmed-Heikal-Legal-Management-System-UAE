import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import type { StaffContext } from "@/server/auth/session";
import { assertPermission, matterScopeWhere } from "./access";
import { invoiceScope } from "./finance-queries";
import { teamWorkload } from "./dashboard";

export const REPORT_PERIODS = ["30", "90", "365"] as const;
export type ReportRow = { label: string; labelAr?: string | null; count: number; amount?: number };
export type Report = Awaited<ReturnType<typeof buildReport>>;

const OPEN_TASK = ["TODO", "IN_PROGRESS", "WAITING"] as const;
const num = (d: Prisma.Decimal | null | undefined) => Number(d ?? 0);

/**
 * Practice reports. Every matter-derived figure is restricted to matters the user can
 * access; financial figures follow the invoice scope and require finance.view.
 * Workload is descriptive only (no scoring).
 */
export async function buildReport(ctx: StaffContext, periodDays: number) {
  assertPermission(ctx, "reports.view");
  const orgId = ctx.org.id;
  const now = new Date();
  const since = new Date(now.getTime() - periodDays * 86400_000);
  const in30 = new Date(now.getTime() + 30 * 86400_000);
  const matter: Prisma.MatterWhereInput = { AND: [matterScopeWhere(ctx), { deletedAt: null }] };
  const active: Prisma.MatterWhereInput = { AND: [matter, { status: { in: ["ACTIVE", "PENDING", "ON_HOLD", "INTAKE"] } }] };

  const [activeCases, closedCases, upcomingHearings, upcomingDeadlines, overdueTasks, byTypeRaw, byCourtRaw, byLawyerRaw, docs] = await Promise.all([
    db.matter.count({ where: active }),
    db.matter.count({ where: { AND: [matter, { closedAt: { gte: since } }] } }),
    db.hearing.count({ where: { deletedAt: null, startsAt: { gte: now, lt: in30 }, status: { not: "CANCELLED" }, matter } }),
    db.deadline.count({ where: { deletedAt: null, dueAt: { gte: now, lt: in30 }, status: "OPEN", matter } }),
    db.task.count({ where: { organizationId: orgId, deletedAt: null, status: { in: [...OPEN_TASK] }, dueAt: { lt: now }, OR: [{ matterId: null, assigneeId: ctx.user.id }, { matter }] } }),
    db.matter.groupBy({ by: ["caseTypeId"], where: active, _count: true }),
    db.matter.groupBy({ by: ["courtId"], where: active, _count: true }),
    db.matter.groupBy({ by: ["leadLawyerId"], where: active, _count: true }),
    db.document.groupBy({ by: ["status"], where: { deletedAt: null, createdAt: { gte: since }, matter }, _count: true }),
  ]);

  const [types, courts, lawyers] = await Promise.all([
    db.caseType.findMany({ where: { organizationId: orgId, id: { in: byTypeRaw.map((r) => r.caseTypeId).filter((x): x is string => !!x) } }, select: { id: true, name: true, nameAr: true } }),
    db.court.findMany({ where: { organizationId: orgId, id: { in: byCourtRaw.map((r) => r.courtId).filter((x): x is string => !!x) } }, select: { id: true, name: true, nameAr: true } }),
    db.user.findMany({ where: { organizationId: orgId, id: { in: byLawyerRaw.map((r) => r.leadLawyerId).filter((x): x is string => !!x) } }, select: { id: true, name: true, nameAr: true } }),
  ]);
  const named = <R extends { _count: number }>(raw: R[], key: (r: R) => string | null, list: { id: string; name: string; nameAr: string | null }[]): ReportRow[] =>
    raw
      .map((r) => {
        const n = list.find((x) => x.id === key(r));
        return { label: n?.name ?? "—", labelAr: n?.nameAr ?? n?.name ?? "—", count: r._count };
      })
      .sort((a, b) => b.count - a.count);

  let clients: { newClients: number; sources: ReportRow[] } | null = null;
  if (ctx.can("clients.view")) {
    const where = { organizationId: orgId, deletedAt: null, createdAt: { gte: since } };
    const [newClients, src] = await Promise.all([db.client.count({ where }), db.client.groupBy({ by: ["source"], where, _count: true })]);
    clients = { newClients, sources: src.map((s) => ({ label: s.source ?? "—", count: s._count })).sort((a, b) => b.count - a.count) };
  }

  let finance: { revenue: number; refunds: number; outstanding: number; outstandingCount: number; expenses: number; minutes: number; currency: string } | null = null;
  if (ctx.can("finance.view")) {
    const inv = invoiceScope(ctx);
    const scopedMatter = ctx.principal.scope === "ASSIGNED" ? { matter: matterScopeWhere(ctx) } : {};
    const [paid, refunded, open, exp, time] = await Promise.all([
      db.payment.aggregate({ where: { isRefund: false, receivedAt: { gte: since }, invoice: inv }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { isRefund: true, receivedAt: { gte: since }, invoice: inv }, _sum: { amount: true } }),
      db.invoice.findMany({ where: { AND: [inv, { status: { in: ["ISSUED", "PARTIALLY_PAID"] } }] }, select: { total: true, amountPaid: true } }),
      db.expense.aggregate({ where: { organizationId: orgId, deletedAt: null, incurredAt: { gte: since }, ...scopedMatter }, _sum: { amount: true } }),
      db.timeEntry.aggregate({ where: { organizationId: orgId, deletedAt: null, startedAt: { gte: since }, ...(ctx.can("time.viewAll") ? {} : { userId: ctx.user.id }) }, _sum: { minutes: true } }),
    ]);
    finance = {
      revenue: num(paid._sum.amount),
      refunds: num(refunded._sum.amount),
      outstanding: open.reduce((s, i) => s + num(i.total) - num(i.amountPaid), 0),
      outstandingCount: open.length,
      expenses: num(exp._sum.amount),
      minutes: time._sum.minutes ?? 0,
      currency: ctx.org.currency,
    };
  }

  return {
    periodDays,
    generatedAt: now.toISOString(),
    kpis: { activeCases, closedCases, upcomingHearings, upcomingDeadlines, overdueTasks },
    byType: named(byTypeRaw, (r) => r.caseTypeId, types),
    byCourt: named(byCourtRaw, (r) => r.courtId, courts),
    byLawyer: named(byLawyerRaw, (r) => r.leadLawyerId, lawyers),
    documents: docs.map((d) => ({ label: d.status, count: d._count })),
    clients,
    finance,
    workload: await teamWorkload(ctx),
  };
}

import "server-only";
import type { TaskStatus } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { matterScopeWhere } from "./access";
import { getAgenda } from "./agenda";
import { dayRange, monthRange, zonedParts } from "@/lib/time";
import { alertLevel, DEFAULT_THRESHOLDS, type AlertThreshold } from "@/lib/deadline";

export function orgThresholds(ctx: StaffContext): AlertThreshold[] {
  const t = (ctx.org.settings as { alertThresholds?: AlertThreshold[] | null }).alertThresholds;
  return Array.isArray(t) && t.length ? t : DEFAULT_THRESHOLDS;
}

/** The next upcoming hearing the user can see — powers the always-visible Next Hearing widget. */
export async function nextHearing(ctx: StaffContext) {
  if (!ctx.can("hearings.view")) return null;
  const now = new Date();
  const scope = matterScopeWhere(ctx);
  const base = { organizationId: ctx.org.id, deletedAt: null, startsAt: { gt: new Date(now.getTime() - 60 * 60_000) }, status: { in: ["SCHEDULED", "PREPARING", "READY"] as ("SCHEDULED" | "PREPARING" | "READY")[] }, matter: scope };
  const include = {
    matter: { select: { id: true, internalNumber: true, officialCaseNumber: true, title: true, titleAr: true } },
    court: { select: { name: true, nameAr: true } },
    attendingLawyer: { select: { name: true, nameAr: true } },
  } as const;
  // Prefer the user's own next hearing; fall back to the office's next hearing for owners/partners.
  const mine = await db.hearing.findFirst({ where: { ...base, attendingLawyerId: ctx.user.id }, orderBy: { startsAt: "asc" }, include });
  const any = ctx.principal.scope === "ALL" ? await db.hearing.findFirst({ where: base, orderBy: { startsAt: "asc" }, include }) : null;
  const h = any && (!mine || any.startsAt < mine.startsAt) ? any : mine;
  if (!h) return null;
  return {
    id: h.id, startsAt: h.startsAt.toISOString(), status: h.status, sessionType: h.sessionType, courtRoom: h.courtRoom, isRemote: h.isRemote,
    court: h.court, lawyer: h.attendingLawyer, matter: h.matter,
  };
}

export async function commandCenter(ctx: StaffContext) {
  const now = new Date();
  const tz = ctx.org.timezone;
  const { start: todayStart, end: todayEnd } = dayRange(now, tz);
  const scope = matterScopeWhere(ctx);
  const thresholds = orgThresholds(ctx);
  const in7d = new Date(now.getTime() + 7 * 86400_000);
  const orgId = ctx.org.id;

  const [today, upcoming7d, overdueDeadlines, myTasks, approvals, activity, portfolio, inactive, riskMatters] = await Promise.all([
    getAgenda(ctx, { from: todayStart, to: todayEnd }),
    getAgenda(ctx, { from: now, to: in7d, kinds: ["DEADLINE", "HEARING"] }),
    ctx.can("deadlines.view")
      ? db.deadline.findMany({
          where: { organizationId: orgId, deletedAt: null, status: "OPEN", dueAt: { lt: now }, matter: scope },
          include: { matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } }, assignee: { select: { name: true, nameAr: true } } },
          orderBy: { dueAt: "asc" },
          take: 10,
        })
      : [],
    ctx.can("tasks.view")
      ? db.task.findMany({
          where: {
            organizationId: orgId, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] },
            OR: [
              { assigneeId: ctx.user.id, OR: [{ dueAt: { lt: todayEnd } }, { priority: { in: ["CRITICAL", "HIGH"] } }] },
              ...(ctx.principal.scope === "ALL" ? [{ matter: scope, priority: "CRITICAL" as const, dueAt: { lt: todayEnd } }] : []),
            ],
          },
          include: { matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } }, assignee: { select: { id: true, name: true, nameAr: true } } },
          orderBy: [{ dueAt: "asc" }],
          take: 12,
        })
      : [],
    ctx.can("approvals.view")
      ? db.approval.findMany({
          where: {
            organizationId: orgId, status: "PENDING",
            AND: [
              ctx.can("approvals.decide") ? {} : { assignedToId: ctx.user.id },
              // Never surface approvals from matters the user cannot see
              { OR: [{ matterId: null }, { matter: scope }] },
            ],
          },
          include: { requestedBy: { select: { name: true, nameAr: true } }, matter: { select: { id: true, internalNumber: true } } },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : [],
    db.activity.findMany({
      where: { organizationId: orgId, createdAt: { gte: new Date(now.getTime() - 3 * 86400_000) }, matter: scope },
      include: { actor: { select: { name: true, nameAr: true } }, matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.matter.groupBy({ by: ["status"], where: scope, _count: true }),
    db.matter.count({ where: { AND: [scope, { status: "ACTIVE", lastActivityAt: { lt: new Date(now.getTime() - 30 * 86400_000) } }] } }),
    db.matter.findMany({
      where: { AND: [scope, { status: { in: ["ACTIVE", "PENDING"] } }, { OR: [{ priority: "CRITICAL" }, { riskFlags: { not: [] } }] }] },
      select: { id: true, internalNumber: true, title: true, titleAr: true, priority: true, riskFlags: true, leadLawyer: { select: { name: true, nameAr: true } } },
      orderBy: [{ priority: "asc" }, { lastActivityAt: "asc" }],
      take: 6,
    }),
  ]);

  const byKind = (k: string) => today.filter((i) => i.kind === k);
  const pendingDocApprovals = approvals.filter((a) => a.kind === "DOCUMENT").length;
  const deadlinesIn24h = upcoming7d.filter((i) => i.kind === "DEADLINE" && new Date(i.startsAt).getTime() - now.getTime() <= 86400_000).length;
  const submissionsDue = upcoming7d.filter((i) => i.kind === "DEADLINE" && i.eventType === "SUBMISSION" && new Date(i.startsAt).getTime() - now.getTime() <= 2 * 86400_000);

  const critical = [
    ...overdueDeadlines.map((d) => ({
      id: d.id, kind: "DEADLINE" as const, title: d.title, at: d.dueAt.toISOString(), level: "OVERDUE" as const, matter: d.matter,
      person: d.assignee?.name ?? null, personAr: d.assignee?.nameAr ?? null, needsVerification: d.verification === "NEEDS_VERIFICATION",
      href: d.matterId ? `/app/cases/${d.matterId}/deadlines` : "/app/agenda",
    })),
    ...upcoming7d.map((i) => ({
      id: i.id, kind: i.kind, title: i.title, at: i.startsAt, level: alertLevel(new Date(i.startsAt), now, thresholds), matter: i.matter,
      person: i.person, personAr: i.personAr, needsVerification: i.needsVerification, href: i.href,
    })),
  ].slice(0, 10);

  return {
    brief: {
      hearings: byKind("HEARING").length,
      appointments: byKind("APPOINTMENT").length,
      tasksForReview: myTasks.filter((t) => t.assignee?.id === ctx.user.id).length,
      submissionsDue: new Set(submissionsDue.map((s) => s.matter?.id)).size,
      deadlinesIn24h,
      approvals: pendingDocApprovals,
      overdue: overdueDeadlines.length,
    },
    today,
    critical,
    tasks: myTasks.map((t) => ({
      id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, priority: t.priority, status: t.status, matter: t.matter,
      assignee: t.assignee, overdue: !!t.dueAt && t.dueAt < now,
    })),
    approvals: approvals.map((a) => ({ id: a.id, kind: a.kind, title: a.title, createdAt: a.createdAt.toISOString(), requestedBy: a.requestedBy, matter: a.matter })),
    activity: activity.map((a) => ({ id: a.id, type: a.type, data: a.data as Record<string, string>, createdAt: a.createdAt.toISOString(), actor: a.actor, matter: a.matter })),
    portfolio: {
      byStatus: Object.fromEntries(portfolio.map((p) => [p.status, p._count])) as Record<string, number>,
      inactive,
      atRisk: riskMatters,
    },
  };
}

export async function teamWorkload(ctx: StaffContext) {
  if (!ctx.can("team.view")) return null;
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400_000);
  const users = await db.user.findMany({
    where: { organizationId: ctx.org.id, kind: "STAFF", status: "ACTIVE", deletedAt: null, matterMemberships: { some: {} } },
    select: { id: true, name: true, nameAr: true, photoUrl: true, position: true, positionAr: true },
    orderBy: { name: "asc" },
  });
  const ids = users.map((u) => u.id);
  const open = { in: ["TODO", "IN_PROGRESS", "WAITING"] as TaskStatus[] };
  // Grouped counts for these users only. (Prisma's `_count` with filters compiles on MySQL to
  // aggregates over the whole tables — 0.5 s at 100k tasks; found by the Phase 11 load test.)
  const [members, tasks, urgent, hearings] = ids.length
    ? await Promise.all([
        db.matterMember.groupBy({ by: ["userId"], where: { userId: { in: ids }, role: { in: ["OWNER", "LEAD", "ASSIGNED"] }, matter: { status: "ACTIVE", deletedAt: null } }, _count: { _all: true } }),
        db.task.groupBy({ by: ["assigneeId"], where: { organizationId: ctx.org.id, assigneeId: { in: ids }, deletedAt: null, status: open }, _count: { _all: true } }),
        db.task.groupBy({ by: ["assigneeId"], where: { organizationId: ctx.org.id, assigneeId: { in: ids }, deletedAt: null, status: open, OR: [{ priority: { in: ["CRITICAL", "HIGH"] } }, { dueAt: { lt: now } }] }, _count: { _all: true } }),
        db.hearing.groupBy({ by: ["attendingLawyerId"], where: { attendingLawyerId: { in: ids }, startsAt: { gte: now, lt: in7d }, deletedAt: null, status: { not: "CANCELLED" } }, _count: { _all: true } }),
      ])
    : [[], [], [], []];
  const m = new Map(members.map((x) => [x.userId, x._count._all]));
  const t = new Map(tasks.map((x) => [x.assigneeId, x._count._all]));
  const urgentMap = new Map(urgent.map((x) => [x.assigneeId, x._count._all]));
  const h = new Map(hearings.map((x) => [x.attendingLawyerId, x._count._all]));
  // Descriptive workload only — deliberately no composite "performance score".
  return users.map((u) => ({
    id: u.id, name: u.name, nameAr: u.nameAr, photoUrl: u.photoUrl, position: u.position, positionAr: u.positionAr,
    activeMatters: m.get(u.id) ?? 0, openTasks: t.get(u.id) ?? 0, urgentTasks: urgentMap.get(u.id) ?? 0, hearings7d: h.get(u.id) ?? 0,
  }));
}

export async function financialSnapshot(ctx: StaffContext) {
  if (!ctx.can("finance.view")) return null;
  const now = new Date();
  const p = zonedParts(now, ctx.org.timezone);
  const monthStart = monthRange(p.year, p.month, ctx.org.timezone).start;
  const orgId = ctx.org.id;
  const [open, overdue, received, unbilled] = await Promise.all([
    db.invoice.aggregate({ where: { organizationId: orgId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, _sum: { total: true, amountPaid: true }, _count: true }),
    db.invoice.aggregate({ where: { organizationId: orgId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } }, _sum: { total: true, amountPaid: true }, _count: true }),
    db.payment.aggregate({ where: { organizationId: orgId, receivedAt: { gte: monthStart } }, _sum: { amount: true } }),
    db.timeEntry.findMany({ where: { organizationId: orgId, deletedAt: null, billable: true, invoiceItem: null }, select: { minutes: true, rate: true } }),
  ]);
  const outstanding = Number(open._sum.total ?? 0) - Number(open._sum.amountPaid ?? 0);
  const overdueAmt = Number(overdue._sum.total ?? 0) - Number(overdue._sum.amountPaid ?? 0);
  const unbilledValue = unbilled.reduce((s, t) => s + (t.minutes / 60) * Number(t.rate ?? 0), 0);
  return {
    outstanding, outstandingCount: open._count, overdue: overdueAmt, overdueCount: overdue._count,
    receivedThisMonth: Number(received._sum.amount ?? 0), unbilledValue, unbilledMinutes: unbilled.reduce((s, t) => s + t.minutes, 0),
  };
}

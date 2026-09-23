import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { matterScopeWhere } from "./access";

export type EventType =
  | "HEARING" | "COURT_DEADLINE" | "CLIENT_MEETING" | "INTERNAL_MEETING" | "SUBMISSION"
  | "EXPERT_MEETING" | "PAYMENT" | "TASK_DEADLINE" | "FOLLOW_UP";

export type AgendaKind = "HEARING" | "DEADLINE" | "APPOINTMENT" | "TASK";

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  eventType: EventType;
  title: string;
  subtitle: string | null;
  subtitleAr: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string;
  matter: { id: string; internalNumber: string; title: string; titleAr: string | null } | null;
  person: string | null;
  personAr: string | null;
  location: string | null;
  isCritical: boolean;
  needsVerification: boolean;
  priority: string | null;
  href: string;
  /** Can be moved by drag & drop (appointments and tasks only — never court dates). */
  movable: boolean;
}

const DEADLINE_EVENT: Record<string, EventType> = {
  SUBMISSION: "SUBMISSION", DOCUMENT: "SUBMISSION", APPEAL: "COURT_DEADLINE", COURT_APPOINTMENT: "COURT_DEADLINE",
  PAYMENT: "PAYMENT", EXPERT_MEETING: "EXPERT_MEETING", FOLLOW_UP: "FOLLOW_UP", RENEWAL: "FOLLOW_UP", INTERNAL: "TASK_DEADLINE", OTHER: "FOLLOW_UP",
};

const matterSel = { select: { id: true, internalNumber: true, title: true, titleAr: true } } as const;

export type AgendaQuery = {
  from: Date;
  to: Date;
  /** Only items the user is personally responsible for. */
  mine?: boolean;
  userId?: string;
  kinds?: AgendaKind[];
  matterId?: string;
  includeDone?: boolean;
};

export async function getAgenda(ctx: StaffContext, q: AgendaQuery): Promise<AgendaItem[]> {
  const me = q.userId ?? ctx.user.id;
  const kinds = new Set(q.kinds ?? ["HEARING", "DEADLINE", "APPOINTMENT", "TASK"]);
  const scope = matterScopeWhere(ctx);
  const matterFilter: Prisma.MatterWhereInput = q.matterId ? { AND: [scope, { id: q.matterId }] } : scope;
  const orgId = ctx.org.id;
  const jobs: Promise<AgendaItem[]>[] = [];

  if (kinds.has("HEARING") && ctx.can("hearings.view")) {
    jobs.push(
      db.hearing
        .findMany({
          where: {
            organizationId: orgId, deletedAt: null, startsAt: { gte: q.from, lt: q.to }, matter: matterFilter,
            status: q.includeDone ? undefined : { not: "CANCELLED" }, ...(q.mine ? { attendingLawyerId: me } : {}),
          },
          include: { matter: matterSel, court: { select: { name: true, nameAr: true } }, attendingLawyer: { select: { name: true, nameAr: true } } },
          orderBy: { startsAt: "asc" },
        })
        .then((rows) =>
          rows.map((h) => ({
            id: h.id, kind: "HEARING" as const, eventType: "HEARING" as const,
            title: h.sessionType || "Hearing", subtitle: h.court?.name ?? null, subtitleAr: h.court?.nameAr ?? h.court?.name ?? null, startsAt: h.startsAt.toISOString(), endsAt: h.endsAt?.toISOString() ?? null,
            status: h.status, matter: h.matter, person: h.attendingLawyer?.name ?? null, personAr: h.attendingLawyer?.nameAr ?? null,
            location: h.isRemote ? "Remote" : [h.court?.name, h.courtRoom].filter(Boolean).join(" · ") || null,
            isCritical: true, needsVerification: false, priority: null, href: `/app/cases/${h.matterId}/hearings?h=${h.id}`, movable: false,
          })),
        ),
    );
  }

  if (kinds.has("DEADLINE") && ctx.can("deadlines.view")) {
    const unlinked: Prisma.DeadlineWhereInput = { matterId: null, OR: [{ assigneeId: me }, { createdById: ctx.user.id }] };
    jobs.push(
      db.deadline
        .findMany({
          where: {
            organizationId: orgId, deletedAt: null, dueAt: { gte: q.from, lt: q.to },
            status: q.includeDone ? { not: "CANCELLED" } : "OPEN",
            AND: [{ OR: q.matterId ? [{ matter: matterFilter }] : [{ matter: matterFilter }, unlinked] }, ...(q.mine ? [{ assigneeId: me }] : [])],
          },
          include: { matter: matterSel, assignee: { select: { name: true, nameAr: true } } },
          orderBy: { dueAt: "asc" },
        })
        .then((rows) =>
          rows.map((d) => ({
            id: d.id, kind: "DEADLINE" as const, eventType: DEADLINE_EVENT[d.type] ?? "FOLLOW_UP",
            title: d.title, subtitle: null, subtitleAr: null, startsAt: d.dueAt.toISOString(), endsAt: null, status: d.status, matter: d.matter,
            person: d.assignee?.name ?? null, personAr: d.assignee?.nameAr ?? null, location: null, isCritical: d.isCritical,
            needsVerification: d.verification === "NEEDS_VERIFICATION", priority: d.isCritical ? "CRITICAL" : null,
            href: d.matterId ? `/app/cases/${d.matterId}/deadlines` : "/app/agenda", movable: false,
          })),
        ),
    );
  }

  if (kinds.has("APPOINTMENT") && ctx.can("calendar.view")) {
    const own: Prisma.AppointmentWhereInput = { lawyerId: me };
    const team: Prisma.AppointmentWhereInput = ctx.can("calendar.viewTeam") ? { matterId: null } : own;
    jobs.push(
      db.appointment
        .findMany({
          where: {
            organizationId: orgId, deletedAt: null, startsAt: { gte: q.from, lt: q.to }, status: q.includeDone ? undefined : { in: ["REQUESTED", "CONFIRMED"] },
            AND: [
              q.matterId ? { matterId: q.matterId, matter: matterFilter } : { OR: [{ matter: matterFilter }, team, own] },
              ...(q.mine ? [own] : []),
            ],
          },
          include: { matter: matterSel, lawyer: { select: { name: true, nameAr: true } }, client: { select: { nameEn: true, nameAr: true } } },
          orderBy: { startsAt: "asc" },
        })
        .then((rows) =>
          rows.map((a) => ({
            id: a.id, kind: "APPOINTMENT" as const, eventType: (a.type === "INTERNAL_MEETING" ? "INTERNAL_MEETING" : "CLIENT_MEETING") as EventType,
            title: a.title, subtitle: a.client?.nameEn ?? null, subtitleAr: a.client?.nameAr ?? a.client?.nameEn ?? null, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), status: a.status,
            matter: a.matter, person: a.lawyer?.name ?? null, personAr: a.lawyer?.nameAr ?? null, location: a.meetingUrl ? "Online" : a.location,
            isCritical: false, needsVerification: false, priority: null, href: a.matterId ? `/app/cases/${a.matterId}` : `/app/calendar?focus=${a.id}`, movable: true,
          })),
        ),
    );
  }

  if (kinds.has("TASK") && ctx.can("tasks.view")) {
    const unlinked: Prisma.TaskWhereInput = { matterId: null, OR: [{ assigneeId: me }, { createdById: ctx.user.id }] };
    jobs.push(
      db.task
        .findMany({
          where: {
            organizationId: orgId, deletedAt: null, dueAt: { gte: q.from, lt: q.to },
            status: q.includeDone ? { not: "CANCELLED" } : { in: ["TODO", "IN_PROGRESS", "WAITING"] },
            AND: [{ OR: q.matterId ? [{ matter: matterFilter }] : [{ matter: matterFilter }, unlinked] }, ...(q.mine ? [{ assigneeId: me }] : [])],
          },
          include: { matter: matterSel, assignee: { select: { name: true, nameAr: true } } },
          orderBy: { dueAt: "asc" },
        })
        .then((rows) =>
          rows.map((t) => ({
            id: t.id, kind: "TASK" as const, eventType: "TASK_DEADLINE" as const, title: t.title, subtitle: null, subtitleAr: null,
            startsAt: t.dueAt!.toISOString(), endsAt: null, status: t.status, matter: t.matter, person: t.assignee?.name ?? null, personAr: t.assignee?.nameAr ?? null,
            location: null, isCritical: t.priority === "CRITICAL", needsVerification: false, priority: t.priority, href: `/app/tasks?task=${t.id}`, movable: true,
          })),
        ),
    );
  }

  const all = (await Promise.all(jobs)).flat();
  return all.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

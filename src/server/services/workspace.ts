import "server-only";
import { cache } from "react";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { matterAccess } from "./access";
import { recordMatterView } from "./matters";

/**
 * Loads the case header once per request (shared by layout and tabs).
 * Returns a discriminated result so the layout can render "Request access" for
 * restricted matters without disclosing their contents.
 */
export const loadWorkspace = cache(async (ctx: StaffContext, id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { state: "missing" as const };
  const acc = await matterAccess(ctx, id);
  if (!acc.exists) return { state: "missing" as const };
  if (!acc.has("matters.view")) {
    const pending = await db.accessRequest.findFirst({ where: { matterId: id, requesterId: ctx.user.id, status: "PENDING" }, select: { id: true } });
    return { state: "restricted" as const, label: acc.matter, pending: !!pending };
  }
  const now = new Date();
  const m = await db.matter.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, nameEn: true, nameAr: true, type: true } },
      caseType: { select: { id: true, name: true, nameAr: true } },
      jurisdiction: { select: { id: true, name: true, nameAr: true, kind: true } },
      court: { select: { id: true, name: true, nameAr: true } },
      stage: { select: { id: true, name: true, nameAr: true, workflowId: true } },
      leadLawyer: { select: { id: true, name: true, nameAr: true, photoUrl: true } },
      owner: { select: { id: true, name: true, nameAr: true } },
      members: { include: { user: { select: { id: true, name: true, nameAr: true, photoUrl: true, position: true, positionAr: true } } }, orderBy: { createdAt: "asc" } },
      parties: { include: { contact: { select: { id: true, nameEn: true, nameAr: true, type: true, category: true } } } },
      hearings: { where: { deletedAt: null, startsAt: { gte: new Date(now.getTime() - 2 * 3600_000) }, status: { in: ["SCHEDULED", "PREPARING", "READY"] } }, orderBy: { startsAt: "asc" }, take: 1, select: { id: true, startsAt: true, sessionType: true, status: true } },
      deadlines: { where: { deletedAt: null, status: "OPEN" }, orderBy: { dueAt: "asc" }, take: 1, select: { id: true, dueAt: true, title: true, verification: true } },
      _count: {
        select: {
          hearings: { where: { deletedAt: null } },
          deadlines: { where: { deletedAt: null, status: "OPEN" } },
          tasks: { where: { deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } } },
          documents: { where: { deletedAt: null } },
          notes: { where: { deletedAt: null } },
          communications: true,
        },
      },
    },
  });
  await recordMatterView(ctx, id);
  const activeMembers = m.members.filter((mm) => !mm.expiresAt || mm.expiresAt > now);
  return {
    state: "ok" as const,
    caps: [...acc.caps],
    memberRole: acc.memberRole,
    matter: {
      ...m,
      claimAmount: m.claimAmount == null ? null : Number(m.claimAmount),
      feeAmount: m.feeAmount == null ? null : Number(m.feeAmount),
      hourlyRate: m.hourlyRate == null ? null : Number(m.hourlyRate),
      members: activeMembers,
      nextHearing: m.hearings[0] ?? null,
      nextDeadline: m.deadlines[0] ?? null,
    },
  };
});

export type Workspace = Extract<Awaited<ReturnType<typeof loadWorkspace>>, { state: "ok" }>;

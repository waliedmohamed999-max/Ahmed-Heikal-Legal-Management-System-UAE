import "server-only";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { assertPermission, matterAccess, matterScopeWhere } from "./access";
import { transitionDocument } from "./documents";
import { verifyDeadline } from "./events";

export async function listApprovals(ctx: StaffContext, tab: "pending" | "history") {
  assertPermission(ctx, "approvals.view");
  const scope = matterScopeWhere(ctx);
  const approvals = await db.approval.findMany({
    where: {
      organizationId: ctx.org.id,
      status: tab === "pending" ? "PENDING" : { not: "PENDING" },
      AND: [ctx.can("approvals.decide") ? {} : { OR: [{ assignedToId: ctx.user.id }, { requestedById: ctx.user.id }] }, { OR: [{ matterId: null }, { matter: scope }] }],
    },
    include: { requestedBy: { select: { name: true, nameAr: true } }, assignedTo: { select: { id: true, name: true, nameAr: true } }, matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } } },
    orderBy: tab === "pending" ? { createdAt: "asc" } : { decidedAt: "desc" },
    take: 100,
  });
  // Access requests the user can decide: pending requests on matters where they may manage members.
  const reqs = tab === "pending" ? await db.accessRequest.findMany({ where: { organizationId: ctx.org.id, status: "PENDING" }, include: { requester: { select: { name: true, nameAr: true } }, matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } } }, orderBy: { createdAt: "asc" } }) : [];
  const decidable = [];
  for (const r of reqs) if ((await matterAccess(ctx, r.matterId)).has("matters.manageMembers")) decidable.push(r);
  return { approvals, accessRequests: decidable };
}

/** Decide a generic approval. Document and deadline approvals are delegated to their own workflows. */
export async function decideApproval(ctx: StaffContext, id: string, decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED", comment: string | null, correctedDueAt?: string | null) {
  const a = await db.approval.findFirst({ where: { id, organizationId: ctx.org.id, status: "PENDING" } });
  if (!a) throw notFound();
  if (a.matterId && !(await matterAccess(ctx, a.matterId)).has("matters.view")) throw notFound();
  if (a.kind === "DOCUMENT") {
    await transitionDocument(ctx, a.entityId, decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED", comment);
    return;
  }
  if (a.kind === "DEADLINE_VERIFICATION") {
    await verifyDeadline(ctx, a.entityId, decision === "APPROVED", correctedDueAt);
    return;
  }
  if (!ctx.can("approvals.decide") && a.assignedToId !== ctx.user.id) throw forbidden();
  if (a.kind === "FINANCIAL" && !ctx.can("finance.approve") && !ctx.can("approvals.decide")) throw forbidden();
  if (decision === "CHANGES_REQUESTED" && a.kind !== "CLIENT_COMMUNICATION") throw new AppError("invalidTransition", 400);
  await db.$transaction(async (tx) => {
    await tx.approval.update({ where: { id }, data: { status: decision, comment, decidedAt: new Date(), assignedToId: a.assignedToId ?? ctx.user.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: `approval.${decision.toLowerCase()}`, entityType: "Approval", entityId: id, matterId: a.matterId, after: { kind: a.kind, comment } }, tx);
  });
}

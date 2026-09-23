import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import type { StaffContext } from "../auth/session";
import { matterCapabilities, type MatterAccessInput } from "@/lib/access";
import type { MatterAction, MemberRole } from "@/lib/permissions";
import { audit } from "../audit";

const activeMembership = (userId: string, now = new Date()): Prisma.MatterMemberWhereInput => ({
  userId,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

/**
 * Prisma filter selecting every matter the user may see. Mirrors lib/access.ts:
 * HIGHLY_CONFIDENTIAL requires membership regardless of role; CONFIDENTIAL requires
 * membership or matters.viewConfidential; STANDARD requires membership or scope ALL.
 */
export function matterScopeWhere(ctx: StaffContext): Prisma.MatterWhereInput {
  const base: Prisma.MatterWhereInput = { organizationId: ctx.org.id, deletedAt: null };
  if (!ctx.can("matters.view") || ctx.principal.scope === "NONE") {
    // Roles like Finance still need matter labels on invoices; they get no matter access here.
    return { ...base, id: { in: [] } };
  }
  const member: Prisma.MatterWhereInput = { members: { some: activeMembership(ctx.user.id) } };
  if (ctx.principal.scope === "ALL") {
    const open: Prisma.MatterWhereInput[] = [{ confidentiality: "STANDARD" }, member];
    if (ctx.can("matters.viewConfidential")) open.push({ confidentiality: "CONFIDENTIAL" });
    return { ...base, OR: open };
  }
  return { ...base, ...member };
}

/** Prisma filter for records hanging off a matter (hearings, deadlines, tasks, documents…). */
export const viaMatter = (ctx: StaffContext) => ({ matter: matterScopeWhere(ctx) });

export type MatterAccess = {
  caps: Set<MatterAction>;
  memberRole: MemberRole | null;
  has: (a: MatterAction) => boolean;
};

async function loadAccessInput(ctx: StaffContext, matterId: string) {
  const m = await db.matter.findFirst({
    where: { id: matterId, organizationId: ctx.org.id },
    select: {
      id: true, confidentiality: true, deletedAt: true, internalNumber: true, title: true, titleAr: true, ownerId: true,
      members: { where: { userId: ctx.user.id }, select: { role: true, overrides: true, expiresAt: true } },
    },
  });
  if (!m) return null;
  const membership = m.members[0] ? { role: m.members[0].role as MemberRole, overrides: m.members[0].overrides, expiresAt: m.members[0].expiresAt } : null;
  const input: MatterAccessInput = { confidentiality: m.confidentiality, deletedAt: m.deletedAt, membership };
  return { m, input, membership };
}

export async function matterAccess(ctx: StaffContext, matterId: string): Promise<MatterAccess & { exists: boolean; matter: { internalNumber: string; title: string; titleAr: string | null; confidentiality: string } | null }> {
  const loaded = await loadAccessInput(ctx, matterId);
  if (!loaded) return { exists: false, matter: null, caps: new Set(), memberRole: null, has: () => false };
  const caps = matterCapabilities(ctx.principal, loaded.input);
  return {
    exists: true,
    // Only expose identifying labels of a highly confidential matter to people with access
    matter:
      caps.size || loaded.m.confidentiality !== "HIGHLY_CONFIDENTIAL"
        ? { internalNumber: loaded.m.internalNumber, title: loaded.m.title, titleAr: loaded.m.titleAr, confidentiality: loaded.m.confidentiality }
        : null,
    caps,
    memberRole: loaded.membership?.role ?? null,
    has: (a) => caps.has(a),
  };
}

/**
 * Enforce a matter-level capability. Throws `notFound` when the user cannot even see
 * the matter (so its existence isn't disclosed), `forbidden` when they can see it but
 * lack the specific action.
 */
export async function assertMatter(ctx: StaffContext, matterId: string, action: MatterAction): Promise<MatterAccess> {
  const acc = await matterAccess(ctx, matterId);
  if (!acc.exists || !acc.caps.has("matters.view")) throw notFound();
  if (!acc.caps.has(action)) {
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "access.denied", entityType: "Matter", entityId: matterId, matterId, metadata: { action } });
    throw forbidden();
  }
  return acc;
}

export function assertPermission(ctx: StaffContext, key: Parameters<StaffContext["can"]>[0]) {
  if (!ctx.can(key)) throw forbidden();
}

/** For records with an optional matter: require the matter capability, or ownership/assignment when unlinked. */
export async function assertOptionalMatter(ctx: StaffContext, matterId: string | null | undefined, action: MatterAction) {
  if (matterId) return assertMatter(ctx, matterId, action);
  const perm = action as Parameters<StaffContext["can"]>[0];
  if (!ctx.can(perm)) throw forbidden();
  return null;
}

export { AppError };

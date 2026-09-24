import "server-only";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { rateLimit } from "../rate-limit";
import { requestMeta } from "../request";
import { sendAccountEmail } from "../services/channels";
import { assertPermission } from "../services/access";
import type { StaffContext } from "./session";
import { hashPassword, passwordPolicyError } from "./password";
import { consumeToken, issueToken, peekToken } from "./tokens";
import { disableMfa } from "./mfa";
import { confirmIdentity } from "./login";

// ─────────────────────────── Self-service password reset ───────────────────────────

/**
 * Request a reset link. The response never reveals whether the address exists.
 * Rate-limited per IP and per address. If e-mail is not configured the link is not
 * delivered (an admin can issue one from Settings → Users instead).
 */
export async function requestPasswordReset(emailRaw: string): Promise<"ok" | "rateLimited"> {
  const email = emailRaw.trim().toLowerCase();
  const { ip } = await requestMeta();
  const [byIp, byEmail] = await Promise.all([rateLimit(`reset:ip:${ip ?? "unknown"}`, 10, 3600), rateLimit(`reset:acct:${email}`, 3, 3600)]);
  if (!byIp.ok || !byEmail.ok) return "rateLimited";
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") return "ok";
  const t = await db.$transaction(async (tx) => {
    const tok = await issueToken(tx, { organizationId: user.organizationId, kind: "PASSWORD_RESET", email, userId: user.id });
    await audit({ organizationId: user.organizationId, actorId: user.id, action: "auth.password_reset_requested", entityType: "User", entityId: user.id }, tx);
    return tok;
  });
  await sendAccountEmail(email, "AH Legal OS — password reset", `A password reset was requested for your account.\n\nOpen this link within 30 minutes to choose a new password:\n${t.url}\n\nIf you did not request this, ignore this message.`);
  return "ok";
}

/** Set a new password from a reset link. Single use; ends every session and clears lockout. */
export async function resetPassword(raw: string, password: string): Promise<{ ok: true; realm: "STAFF" | "CLIENT" } | { ok: false; error: string }> {
  const pe = passwordPolicyError(password);
  if (pe) return { ok: false, error: pe };
  const hash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    const t = await consumeToken(tx, "PASSWORD_RESET", raw);
    if (!t?.userId) return { ok: false as const, error: "tokenInvalid" };
    const user = await tx.user.findUnique({ where: { id: t.userId } });
    if (!user || user.deletedAt || user.status !== "ACTIVE" || user.email !== t.email) return { ok: false as const, error: "tokenInvalid" };
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ organizationId: user.organizationId, actorId: user.id, action: "auth.password_reset_completed", entityType: "User", entityId: user.id }, tx);
    return { ok: true as const, realm: user.kind };
  });
}

// ─────────────────────────── Invitations ───────────────────────────

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).optional().default(""),
  roleId: z.string().uuid(),
  matterIds: z.array(z.string().uuid()).max(50).default([]),
});

/** Invite a staff member: one-time, 7-day, bound to this address, role and (optionally) cases. */
export async function inviteUser(ctx: StaffContext, input: z.output<typeof inviteSchema>) {
  assertPermission(ctx, "team.manage");
  const rl = await rateLimit(`invite:${ctx.user.id}`, 20, 3600);
  if (!rl.ok) throw new AppError("rateLimited", 429);
  const role = await db.role.findFirst({ where: { id: input.roleId, organizationId: ctx.org.id } });
  if (!role || role.key === "client") throw new AppError("validation", 400, { roleId: "invalid" });
  if (role.key === "owner" && !ctx.can("roles.manage")) throw forbidden();
  if (await db.user.findUnique({ where: { email: input.email } })) throw new AppError("conflict", 409, { email: "invalid" });
  const matters = input.matterIds.length ? await db.matter.findMany({ where: { id: { in: input.matterIds }, organizationId: ctx.org.id, deletedAt: null }, select: { id: true } }) : [];
  const t = await db.$transaction(async (tx) => {
    const tok = await issueToken(tx, { organizationId: ctx.org.id, kind: "INVITATION", email: input.email, roleId: role.id, name: input.name || null, matterIds: matters.map((m) => m.id), createdById: ctx.user.id });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "user.invited", entityType: "AuthToken", entityId: tok.id, after: { email: input.email, role: role.key, matters: matters.length } }, tx);
    return tok;
  });
  const emailed = await sendAccountEmail(input.email, "AH Legal OS — invitation", `You have been invited to AH Legal OS.\n\nOpen this link within 7 days to set your password:\n${t.url}`);
  // When e-mail is not configured the admin receives the link once, to pass on securely.
  return { emailed, link: emailed ? null : t.url, expiresAt: t.expiresAt.toISOString() };
}

export async function acceptInvitation(input: { token: string; name: string; nameAr?: string; password: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "required" };
  const pe = passwordPolicyError(input.password);
  if (pe) return { ok: false, error: pe };
  const hash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const t = await consumeToken(tx, "INVITATION", input.token);
    if (!t?.roleId) return { ok: false as const, error: "tokenInvalid" };
    if (await tx.user.findUnique({ where: { email: t.email } })) return { ok: false as const, error: "tokenInvalid" };
    const u = await tx.user.create({
      data: { organizationId: t.organizationId, kind: "STAFF", email: t.email, name, nameAr: input.nameAr?.trim() || null, roleId: t.roleId, passwordHash: hash, passwordChangedAt: new Date(), locale: "ar", status: "ACTIVE" },
    });
    const ids = Array.isArray(t.matterIds) ? (t.matterIds as string[]) : [];
    for (const matterId of ids) {
      await tx.matterMember.create({ data: { matterId, userId: u.id, role: "ASSIGNED", grantedById: t.createdById } }).catch(() => undefined);
    }
    await audit({ organizationId: t.organizationId, actorId: u.id, action: "user.invitation_accepted", entityType: "User", entityId: u.id, after: { email: u.email, matters: ids.length } }, tx);
    return { ok: true as const };
  });
}

export async function invitationPreview(raw: string) {
  const t = await peekToken("INVITATION", raw);
  return t ? { email: t.email, name: t.name ?? "" } : null;
}

// ─────────────────────────── Admin account actions ───────────────────────────

async function targetUser(ctx: StaffContext, userId: string) {
  const u = await db.user.findFirst({ where: { id: userId, organizationId: ctx.org.id, deletedAt: null } });
  if (!u) throw notFound();
  return u;
}

/** Admin issues a reset link (e-mailed when possible, otherwise returned once). */
export async function adminSendPasswordReset(ctx: StaffContext, userId: string) {
  assertPermission(ctx, "team.manage");
  const u = await targetUser(ctx, userId);
  const t = await db.$transaction(async (tx) => {
    const tok = await issueToken(tx, { organizationId: ctx.org.id, kind: "PASSWORD_RESET", email: u.email, userId: u.id, createdById: ctx.user.id });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "auth.password_reset_issued", entityType: "User", entityId: u.id }, tx);
    return tok;
  });
  const emailed = await sendAccountEmail(u.email, "AH Legal OS — password reset", `An administrator issued a password reset for your account.\n\nOpen this link within 30 minutes:\n${t.url}`);
  return { emailed, link: emailed ? null : t.url };
}

/** Reset another user's MFA (lost device). Requires the admin's step-up; ends the user's sessions. */
export async function adminResetMfa(ctx: StaffContext, userId: string, password: string, totp?: string | null) {
  assertPermission(ctx, "team.manage");
  const u = await targetUser(ctx, userId);
  if (u.id === ctx.user.id) throw new AppError("validation", 400);
  await confirmIdentity(ctx, password, totp);
  await disableMfa(u.id);
  await db.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "auth.mfa_reset_by_admin", entityType: "User", entityId: u.id });
}

/** End every session of a user (admin) — e.g. suspected compromise or lost device. */
export async function adminRevokeUserSessions(ctx: StaffContext, userId: string) {
  assertPermission(ctx, "team.manage");
  const u = await targetUser(ctx, userId);
  const r = await db.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "auth.sessions_revoked_by_admin", entityType: "User", entityId: u.id, metadata: { count: r.count } });
  return { count: r.count };
}

/** End every other session of the current user. */
export async function revokeOtherSessions(ctx: StaffContext) {
  const r = await db.session.updateMany({ where: { userId: ctx.user.id, revokedAt: null, id: { not: ctx.sessionId } }, data: { revokedAt: new Date() } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "auth.other_sessions_revoked", entityType: "User", entityId: ctx.user.id, metadata: { count: r.count } });
  return { count: r.count };
}

// ─────────────────────────── Offboarding ───────────────────────────

export const offboardSchema = z.object({ userId: z.string().uuid(), transferToId: z.string().uuid(), password: z.string().min(1).max(200), totp: z.string().max(12).optional().nullable() });

/**
 * Offboard a staff member: suspend, end sessions, revoke pending tokens, transfer open
 * work (lead/owner of cases, open tasks, open deadlines, upcoming hearings, open
 * approvals) to a colleague, remove case memberships. Nothing is deleted — history,
 * authorship and the audit trail are preserved. Requires step-up.
 */
export async function offboardUser(ctx: StaffContext, input: z.output<typeof offboardSchema>) {
  assertPermission(ctx, "team.manage");
  if (input.userId === ctx.user.id || input.userId === input.transferToId) throw new AppError("validation", 400);
  const [u, to] = await Promise.all([targetUser(ctx, input.userId), targetUser(ctx, input.transferToId)]);
  if (u.kind !== "STAFF" || to.kind !== "STAFF" || to.status !== "ACTIVE") throw new AppError("validation", 400, { transferToId: "invalid" });
  await confirmIdentity(ctx, input.password, input.totp);
  const now = new Date();
  const counts = await db.$transaction(async (tx) => {
    const owner = await tx.role.findFirst({ where: { organizationId: ctx.org.id, key: "owner" }, select: { id: true } });
    if (owner && u.roleId === owner.id) {
      const others = await tx.user.count({ where: { organizationId: ctx.org.id, roleId: owner.id, status: "ACTIVE", deletedAt: null, id: { not: u.id } } });
      if (!others) throw new AppError("lastOwner", 400);
    }
    const led = await tx.matter.updateMany({ where: { organizationId: ctx.org.id, leadLawyerId: u.id, deletedAt: null, status: { notIn: ["CLOSED", "ARCHIVED"] } }, data: { leadLawyerId: to.id } });
    const owned = await tx.matter.updateMany({ where: { organizationId: ctx.org.id, ownerId: u.id, deletedAt: null, status: { notIn: ["CLOSED", "ARCHIVED"] } }, data: { ownerId: to.id } });
    const tasks = await tx.task.updateMany({ where: { organizationId: ctx.org.id, assigneeId: u.id, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }, data: { assigneeId: to.id } });
    const deadlines = await tx.deadline.updateMany({ where: { organizationId: ctx.org.id, assigneeId: u.id, deletedAt: null, status: "OPEN" }, data: { assigneeId: to.id } });
    const hearings = await tx.hearing.updateMany({ where: { organizationId: ctx.org.id, attendingLawyerId: u.id, deletedAt: null, startsAt: { gte: now } }, data: { attendingLawyerId: to.id } });
    const approvals = await tx.approval.updateMany({ where: { organizationId: ctx.org.id, assignedToId: u.id, status: "PENDING" }, data: { assignedToId: to.id } });
    // Give the colleague access to the transferred cases; remove the leaver's memberships.
    const memberships = await tx.matterMember.findMany({ where: { userId: u.id }, select: { id: true, matterId: true } });
    for (const m of memberships) {
      const exists = await tx.matterMember.findFirst({ where: { matterId: m.matterId, userId: to.id }, select: { id: true } });
      if (!exists) await tx.matterMember.create({ data: { matterId: m.matterId, userId: to.id, role: "ASSIGNED", grantedById: ctx.user.id } });
      await tx.matterMember.delete({ where: { id: m.id } });
    }
    await tx.reminder.updateMany({ where: { userId: u.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.authToken.updateMany({ where: { OR: [{ userId: u.id }, { email: u.email }], usedAt: null, revokedAt: null }, data: { revokedAt: now } });
    await tx.user.update({ where: { id: u.id }, data: { status: "SUSPENDED", offboardedAt: now } });
    const c = { matters: led.count + owned.count, tasks: tasks.count, deadlines: deadlines.count, hearings: hearings.count, approvals: approvals.count, memberships: memberships.length };
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "user.offboarded", entityType: "User", entityId: u.id, metadata: { transferredTo: to.id, ...c } }, tx);
    return c;
  });
  return counts;
}

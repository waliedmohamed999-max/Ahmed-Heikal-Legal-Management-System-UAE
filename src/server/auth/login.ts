import "server-only";
import type { UserKind } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { requestMeta } from "../request";
import { AppError } from "../errors";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, getClientContext, getStaffContext, rotateSession } from "./session";
import { consumeRecoveryCode, verifyAndConsumeTotp } from "./mfa";

const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;
// Pre-computed hash so unknown emails cost the same time as known ones (no user enumeration by timing).
let dummyHash: Promise<string> | undefined;

export type LoginOutcome = { ok: true; mfa: boolean } | { ok: false; error: "invalid" | "locked" | "rateLimited" };

export async function login(emailRaw: string, password: string, realm: UserKind): Promise<LoginOutcome> {
  const email = emailRaw.trim().toLowerCase();
  const { ip } = await requestMeta();
  const [byIp, byAccount] = await Promise.all([
    rateLimit(`login:ip:${ip ?? "unknown"}`, 30, 15 * 60),
    rateLimit(`login:acct:${email}`, 10, 15 * 60),
  ]);
  if (!byIp.ok || !byAccount.ok) return { ok: false, error: "rateLimited" };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.kind !== realm || user.deletedAt || user.status !== "ACTIVE") {
    dummyHash ??= hashPassword("timing-equaliser-not-a-real-password-1");
    await verifyPassword(await dummyHash, password);
    return { ok: false, error: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ organizationId: user.organizationId, actorId: user.id, action: "auth.login_blocked_locked", entityType: "User", entityId: user.id });
    return { ok: false, error: "locked" };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failures = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures >= MAX_FAILURES ? 0 : failures,
        lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
      },
    });
    await audit({
      organizationId: user.organizationId, actorId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id,
      metadata: { failures, locked: failures >= MAX_FAILURES },
    });
    return { ok: false, error: failures >= MAX_FAILURES ? "locked" : "invalid" };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const session = await createSession(user.id, realm, !user.mfaEnabled);
  await audit({
    organizationId: user.organizationId, actorId: user.id, sessionId: session.id,
    action: realm === "CLIENT" ? "auth.portal_login" : "auth.login", entityType: "User", entityId: user.id,
    metadata: { mfaPending: user.mfaEnabled },
  });
  return { ok: true, mfa: user.mfaEnabled };
}

/**
 * Second factor after password login: a TOTP code (replay-protected) or a one-time
 * recovery code. On success the session token is rotated.
 */
export async function verifyMfa(code: string): Promise<boolean> {
  const ctx = await getStaffContext();
  if (!ctx) return false;
  const rl = await rateLimit(`mfa:${ctx.user.id}`, 6, 10 * 60);
  if (!rl.ok) return false;
  const raw = code.trim();
  const viaRecovery = !/^\d{3}\s?\d{3}$/.test(raw);
  const valid = viaRecovery ? await consumeRecoveryCode(ctx.user.id, raw) : await verifyAndConsumeTotp(ctx.user.id, raw);
  await audit({
    organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId,
    action: valid ? (viaRecovery ? "auth.mfa_recovery_code_used" : "auth.mfa_verified") : "auth.mfa_failed",
  });
  if (!valid) return false;
  await rotateSession(ctx.sessionId, "STAFF", { mfaVerified: true, stepUpAt: new Date() });
  return true;
}

/**
 * Step-up re-authentication for sensitive actions (MFA changes, office export,
 * admin MFA reset, offboarding…): the current password, plus a TOTP code when MFA is on.
 * Throws AppError("reauthRequired") on failure. Audited either way.
 */
export async function confirmIdentity(ctx: { user: { id: string; mfaEnabled: boolean }; org: { id: string }; sessionId: string }, password: string, totp?: string | null) {
  const rl = await rateLimit(`stepup:${ctx.user.id}`, 8, 10 * 60);
  if (!rl.ok) throw new AppError("rateLimited", 429);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { passwordHash: true, mfaEnabled: true } });
  const ok = (await verifyPassword(user.passwordHash, password)) && (!user.mfaEnabled || (!!totp && (await verifyAndConsumeTotp(ctx.user.id, totp))));
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: ok ? "auth.step_up" : "auth.step_up_failed" });
  if (!ok) throw new AppError("reauthRequired", 403, { password: "invalid" });
  await db.session.update({ where: { id: ctx.sessionId }, data: { stepUpAt: new Date() } });
}

export async function logout(realm: UserKind) {
  const ctx = realm === "STAFF" ? await getStaffContext() : await getClientContext();
  if (ctx) {
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: realm === "CLIENT" ? "auth.portal_logout" : "auth.logout" });
  }
  await destroySession(realm);
}

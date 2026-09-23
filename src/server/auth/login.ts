import "server-only";
import { verify as verifyTotp, generateSecret, generateURI } from "otplib";
import type { UserKind } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { requestMeta } from "../request";
import { decryptField, encryptField } from "../crypto";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, getClientContext, getStaffContext } from "./session";

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

export async function verifyMfa(code: string): Promise<boolean> {
  const ctx = await getStaffContext();
  if (!ctx) return false;
  const rl = await rateLimit(`mfa:${ctx.user.id}`, 6, 10 * 60);
  if (!rl.ok) return false;
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  const secret = decryptField(user.mfaSecretEnc);
  if (!secret) return false;
  const result = await verifyTotp({ secret, token: code.replace(/\s/g, "") });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: result.valid ? "auth.mfa_verified" : "auth.mfa_failed" });
  if (!result.valid) return false;
  await db.session.update({ where: { id: ctx.sessionId }, data: { mfaVerified: true } });
  return true;
}

/** Begin MFA enrolment: store an encrypted pending secret and return the otpauth URI. */
export async function beginMfaEnrolment(userId: string, email: string) {
  const secret = generateSecret();
  await db.user.update({ where: { id: userId }, data: { mfaSecretEnc: encryptField(secret), mfaEnabled: false } });
  return { secret, uri: generateURI({ issuer: "AH Legal OS", label: email, secret }) };
}

export async function confirmMfaEnrolment(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = decryptField(user.mfaSecretEnc);
  if (!secret) return false;
  const { valid } = await verifyTotp({ secret, token: code });
  if (!valid) return false;
  await db.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  await audit({ organizationId: user.organizationId, actorId: userId, action: "auth.mfa_enabled", entityType: "User", entityId: userId });
  return true;
}

export async function logout(realm: UserKind) {
  const ctx = realm === "STAFF" ? await getStaffContext() : await getClientContext();
  if (ctx) {
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: realm === "CLIENT" ? "auth.portal_logout" : "auth.logout" });
  }
  await destroySession(realm);
}

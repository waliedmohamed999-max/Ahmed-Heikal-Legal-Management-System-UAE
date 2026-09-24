import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma, UserKind } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { requestMeta } from "../request";
import type { Principal, Scope } from "@/lib/access";
import type { PermissionKey } from "@/lib/permissions";

// Staff and client-portal sessions use separate cookies and separate realms:
// a portal session can never authenticate against the internal app, and vice versa.
export const COOKIE = { STAFF: "ahl_s", CLIENT: "ahl_p" } as const;
const ABSOLUTE_TTL_MS = 7 * 24 * 3600_000;
const IDLE_TTL_MS = 12 * 3600_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export async function createSession(userId: string, realm: UserKind, mfaVerified: boolean) {
  const token = randomToken(32);
  const { ip, userAgent } = await requestMeta();
  const session = await db.session.create({
    data: {
      userId,
      realm,
      mfaVerified,
      ip,
      userAgent,
      tokenHash: sha256(token), // only the hash is stored
      expiresAt: new Date(Date.now() + ABSOLUTE_TTL_MS),
    },
  });
  const jar = await cookies();
  jar.set(COOKIE[realm], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_TTL_MS / 1000,
  });
  return session;
}

/**
 * Replace the current session with a fresh token (after MFA or step-up), so a token
 * captured before the privilege change is useless. The old row is revoked.
 */
export async function rotateSession(oldSessionId: string, realm: UserKind, patch: { mfaVerified?: boolean; stepUpAt?: Date }) {
  const old = await db.session.findUniqueOrThrow({ where: { id: oldSessionId } });
  const token = randomToken(32);
  const { ip, userAgent } = await requestMeta();
  const fresh = await db.$transaction(async (tx) => {
    await tx.session.update({ where: { id: old.id }, data: { revokedAt: new Date() } });
    return tx.session.create({
      data: {
        userId: old.userId, realm, ip, userAgent, tokenHash: sha256(token), expiresAt: old.expiresAt,
        mfaVerified: patch.mfaVerified ?? old.mfaVerified, stepUpAt: patch.stepUpAt ?? old.stepUpAt,
      },
    });
  });
  const jar = await cookies();
  jar.set(COOKIE[realm], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, Math.floor((old.expiresAt.getTime() - Date.now()) / 1000)),
  });
  return fresh;
}

export async function destroySession(realm: UserKind) {
  const jar = await cookies();
  const token = jar.get(COOKIE[realm])?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(COOKIE[realm]);
}

async function loadContext(realm: UserKind) {
  const jar = await cookies();
  const token = jar.get(COOKIE[realm])?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { select: { permissionKey: true } } } },
          organization: true,
        },
      },
    },
  });
  const now = Date.now();
  if (
    !session ||
    session.revokedAt ||
    session.realm !== realm ||
    session.expiresAt.getTime() < now ||
    now - session.lastSeenAt.getTime() > IDLE_TTL_MS ||
    session.user.status !== "ACTIVE" ||
    session.user.deletedAt ||
    session.user.kind !== realm
  ) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return contextFromSession(session);
}

export { contextFromSession, type LoadedSession } from "./context";
import { contextFromSession } from "./context";
/** Per-request memoised session lookups — for Server Components and Server Actions. */
export const getStaffContext = cache(() => loadContext("STAFF"));
export const getClientContext = cache(() => loadContext("CLIENT"));

/**
 * Uncached lookups for Route Handlers (`app/api/**`). React `cache()` is a rendering primitive: in a
 * production build a cached call inside a route handler runs outside Next.js's request scope and
 * `cookies()` throws (found by the Phase 11 production-build load test — every authenticated API
 * route returned 500). Route handlers therefore never go through `cache()`.
 */
export const loadStaffContext = () => loadContext("STAFF");
export const loadClientContext = () => loadContext("CLIENT");

export type StaffContext = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

/** Guard for server components / actions of the internal app. */
export async function requireStaff(): Promise<StaffContext> {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");
  if (ctx.mfaRequired && !ctx.mfaVerified) redirect("/login/mfa");
  if (ctx.mfaEnrollmentRequired) redirect("/login/mfa-setup");
  return ctx;
}

/** Guard for the client portal. */
export async function requireClient(): Promise<StaffContext & { user: { clientId: string } }> {
  const ctx = await getClientContext();
  if (!ctx || !ctx.can("portal.access") || !ctx.user.clientId) redirect("/portal/login");
  return ctx as StaffContext & { user: { clientId: string } };
}

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

type LoadedSession = {
  id: string;
  mfaVerified: boolean;
  user: Prisma.UserGetPayload<{ include: { role: { include: { permissions: { select: { permissionKey: true } } } }; organization: true } }>;
};

/** Map a validated session row to the request context. Exported for DB-backed integration tests. */
export function contextFromSession(session: LoadedSession) {
  const { user } = session;
  const permissions = new Set<string>(user.role.permissions.map((p) => p.permissionKey));
  const principal: Principal = {
    userId: user.id,
    kind: user.kind,
    scope: user.role.matterScope as Scope,
    permissions,
  };

  return {
    sessionId: session.id,
    mfaVerified: session.mfaVerified,
    mfaRequired: user.mfaEnabled,
    user: {
      id: user.id,
      name: user.name,
      nameAr: user.nameAr,
      email: user.email,
      locale: user.locale,
      position: user.position,
      positionAr: user.positionAr,
      photoUrl: user.photoUrl,
      clientId: user.clientId,
      preferences: user.preferences as Record<string, unknown>,
      mfaEnabled: user.mfaEnabled,
    },
    role: {
      id: user.role.id,
      key: user.role.key,
      name: user.role.name,
      nameAr: user.role.nameAr,
      scope: user.role.matterScope,
    },
    org: {
      id: user.organization.id,
      name: user.organization.name,
      nameAr: user.organization.nameAr,
      timezone: user.organization.timezone,
      currency: user.organization.currency,
      vatRate: Number(user.organization.vatRate),
      settings: user.organization.settings as Record<string, unknown>,
      isDemo: user.organization.isDemo,
    },
    principal,
    can: (key: PermissionKey) => permissions.has(key),
  };
}

/** Per-request memoised session lookups. */
export const getStaffContext = cache(() => loadContext("STAFF"));
export const getClientContext = cache(() => loadContext("CLIENT"));

export type StaffContext = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

/** Guard for server components / actions of the internal app. */
export async function requireStaff(): Promise<StaffContext> {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");
  if (ctx.mfaRequired && !ctx.mfaVerified) redirect("/login/mfa");
  return ctx;
}

/** Guard for the client portal. */
export async function requireClient(): Promise<StaffContext & { user: { clientId: string } }> {
  const ctx = await getClientContext();
  if (!ctx || !ctx.can("portal.access") || !ctx.user.clientId) redirect("/portal/login");
  return ctx as StaffContext & { user: { clientId: string } };
}

import type { Prisma } from "@prisma/client";
import type { Principal, Scope } from "@/lib/access";
import type { PermissionKey } from "@/lib/permissions";

// Pure mapping from a validated session row to the request context. Kept free of Next.js
// imports so CLI tools, the worker and tests can build a context outside a request.

export type LoadedSession = {
  id: string;
  mfaVerified: boolean;
  stepUpAt?: Date | null;
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
    // The role demands MFA but the user has not enrolled yet: only the enrolment flow is allowed.
    mfaEnrollmentRequired: !!user.role.requireMfa && !user.mfaEnabled,
    stepUpAt: session.stepUpAt ?? null,
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


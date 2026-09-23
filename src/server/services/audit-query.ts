import "server-only";
import type { Prisma } from "@prisma/client";

/** Shared filter for the audit dashboard and its CSV export (dates are office-local, Asia/Dubai). */
export function auditWhere(orgId: string, sp: Record<string, string | undefined>): Prisma.AuditLogWhereInput {
  const day = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00+04:00`) : undefined);
  const from = sp.from ? day(sp.from) : undefined;
  const to = sp.to ? day(sp.to) : undefined;
  return {
    organizationId: orgId,
    ...(sp.user && /^[0-9a-f-]{36}$/i.test(sp.user) ? { actorId: sp.user } : {}),
    ...(sp.action ? { action: { startsWith: sp.action } } : {}),
    ...(sp.q ? { OR: [{ action: { contains: sp.q, mode: "insensitive" as const } }, { entityId: sp.q }, { ip: { contains: sp.q } }, { matter: { internalNumber: { contains: sp.q, mode: "insensitive" as const } } }] } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400_000) } : {}) } } : {}),
  };
}

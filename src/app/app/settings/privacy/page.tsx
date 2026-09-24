import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { PrivacyView } from "./view";
import { OfficeExport } from "./office-export";

export default async function PrivacyPage() {
  const ctx = await requireStaff();
  if (!ctx.can("privacy.manage")) notFound();
  const { locale } = await getT();
  const [requests, breaches] = await Promise.all([
    db.privacyRequest.findMany({ where: { organizationId: ctx.org.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.breachLog.findMany({ where: { organizationId: ctx.org.id }, orderBy: { detectedAt: "desc" }, take: 50 }),
  ]);
  const clients = await db.client.findMany({ where: { id: { in: requests.map((r) => r.subjectId) } }, select: { id: true, nameEn: true, nameAr: true } });
  const cn = new Map(clients.map((c) => [c.id, locale === "ar" ? c.nameAr || c.nameEn : c.nameEn]));
  return (
    <div className="space-y-5">
    <PrivacyView
      retentionYears={((ctx.org.settings as { retention?: { closedMatterYears?: number } }).retention?.closedMatterYears) ?? 10}
      requests={requests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, subjectId: r.subjectId, subject: cn.get(r.subjectId) ?? "—", notes: r.notes, createdAt: r.createdAt.toISOString() }))}
      breaches={breaches.map((b) => ({ id: b.id, detectedAt: b.detectedAt.toISOString(), description: b.description, severity: b.severity, affectedData: b.affectedData, actionsTaken: b.actionsTaken, reportedToAuthorityAt: b.reportedToAuthorityAt?.toISOString() ?? null }))}
    />
    {ctx.can("roles.manage") && <OfficeExport mfa={ctx.user.mfaEnabled} />}
    </div>
  );
}

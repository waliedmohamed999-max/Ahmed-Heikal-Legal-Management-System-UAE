import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace } from "@/server/services/workspace";
import { db } from "@/server/db";
import { orgThresholds } from "@/server/services/dashboard";
import { DeadlinesView } from "@/components/deadlines-view";

export default async function CaseDeadlinesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { locale } = await getT();
  const ws = await loadWorkspace(ctx, id);
  if (ws.state !== "ok") return null; // the layout renders the restricted / missing state
  const rows = await db.deadline.findMany({
    where: { matterId: id, deletedAt: null },
    orderBy: { dueAt: "asc" },
    include: { assignee: { select: { id: true, name: true, nameAr: true } }, verifiedBy: { select: { name: true, nameAr: true } } },
  });
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <DeadlinesView
      matterId={id}
      matterLabel={`${ws.matter.internalNumber} · ${L(ws.matter.title, ws.matter.titleAr)}`}
      thresholds={orgThresholds(ctx)}
      canManage={ws.caps.includes("deadlines.manage")}
      canVerify={ws.caps.includes("deadlines.verify")}
      rows={rows.map((d) => ({
        id: d.id, type: d.type, title: d.title, description: d.description, dueAt: d.dueAt.toISOString(), isCritical: d.isCritical, status: d.status, verification: d.verification,
        source: d.source, assignee: d.assignee ? { id: d.assignee.id, name: L(d.assignee.name, d.assignee.nameAr) } : null,
        verifiedBy: d.verifiedBy ? L(d.verifiedBy.name, d.verifiedBy.nameAr) : null, matter: null,
      }))}
    />
  );
}

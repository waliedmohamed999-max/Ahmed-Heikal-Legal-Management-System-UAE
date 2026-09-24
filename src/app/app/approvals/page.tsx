import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { listApprovals } from "@/server/services/approvals";
import { Page, PageHeader } from "@/components/ui/layout";
import { ApprovalsView } from "./view";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string; focus?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("approvals.view")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "pending";
  const data = await listApprovals(ctx, tab);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <Page width="full" className="max-w-[1440px]">
      <PageHeader title={t("approvals.title")} subtitle={t("approvals.subtitle")} />
      <ApprovalsView
        tab={tab}
        focus={sp.focus ?? null}
        canDecide={ctx.can("approvals.decide")}
        meId={ctx.user.id}
        approvals={data.approvals.map((a) => ({
          id: a.id, kind: a.kind, title: a.title, entityType: a.entityType, entityId: a.entityId, status: a.status, comment: a.comment, createdAt: a.createdAt.toISOString(),
          decidedAt: a.decidedAt?.toISOString() ?? null, requestedBy: a.requestedBy ? L(a.requestedBy.name, a.requestedBy.nameAr) : null,
          assignedTo: a.assignedTo ? { id: a.assignedTo.id, name: L(a.assignedTo.name, a.assignedTo.nameAr) } : null,
          matter: a.matter ? { id: a.matter.id, number: a.matter.internalNumber, label: `${a.matter.internalNumber} · ${L(a.matter.title, a.matter.titleAr)}` } : null,
        }))}
        accessRequests={data.accessRequests.map((r) => ({ id: r.id, name: L(r.requester.name, r.requester.nameAr), reason: r.reason, createdAt: r.createdAt.toISOString(), matter: { id: r.matter.id, number: r.matter.internalNumber, label: `${r.matter.internalNumber} · ${L(r.matter.title, r.matter.titleAr)}` } }))}
      />
    </Page>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { listApprovals } from "@/server/services/approvals";
import { PageHeader } from "@/components/ui/layout";
import { cn } from "@/lib/utils";
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
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("approvals.title")} subtitle={t("approvals.subtitle")} />
      <nav className="mt-6 flex gap-1">
        {(["pending", "history"] as const).map((k) => (
          <Link key={k} href={`/app/approvals?tab=${k}`} className={cn("h-8 rounded-md px-3 py-1.5 text-[13px] font-medium", tab === k ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-surface")}>{t(`approvals.${k}`)}</Link>
        ))}
      </nav>
      <ApprovalsView
        tab={tab}
        focus={sp.focus ?? null}
        canDecide={ctx.can("approvals.decide")}
        meId={ctx.user.id}
        approvals={data.approvals.map((a) => ({
          id: a.id, kind: a.kind, title: a.title, entityType: a.entityType, entityId: a.entityId, status: a.status, comment: a.comment, createdAt: a.createdAt.toISOString(),
          decidedAt: a.decidedAt?.toISOString() ?? null, requestedBy: a.requestedBy ? L(a.requestedBy.name, a.requestedBy.nameAr) : null,
          assignedTo: a.assignedTo ? { id: a.assignedTo.id, name: L(a.assignedTo.name, a.assignedTo.nameAr) } : null,
          matter: a.matter ? { id: a.matter.id, label: `${a.matter.internalNumber} · ${L(a.matter.title, a.matter.titleAr)}` } : null,
        }))}
        accessRequests={data.accessRequests.map((r) => ({ id: r.id, name: L(r.requester.name, r.requester.nameAr), reason: r.reason, createdAt: r.createdAt.toISOString(), matter: { id: r.matter.id, label: `${r.matter.internalNumber} · ${L(r.matter.title, r.matter.titleAr)}` } }))}
      />
    </div>
  );
}

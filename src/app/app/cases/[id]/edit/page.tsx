import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace } from "@/server/services/workspace";
import { getReference } from "@/server/services/reference";
import { Panel } from "@/components/ui/layout";
import { EditCaseForm } from "./form";

export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const ws = await loadWorkspace(ctx, id);
  if (ws.state !== "ok") return null; // the layout renders the restricted / missing state
  if (!ws.caps.includes("matters.edit")) notFound();
  const ref = await getReference(ctx.org.id);
  const m = ws.matter;
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <Panel title={t("workspace.edit")}>
      <EditCaseForm
        caps={ws.caps}
        initial={{
          id: m.id, title: m.title, titleAr: m.titleAr ?? "", officialCaseNumber: m.officialCaseNumber ?? "", kind: m.kind, status: m.status, priority: m.priority,
          confidentiality: m.confidentiality, caseTypeId: m.caseTypeId ?? "", jurisdictionId: m.jurisdictionId ?? "", courtId: m.courtId ?? "", stageId: m.stageId ?? "",
          leadLawyerId: m.leadLawyerId ?? "", summary: m.summary ?? "", claims: m.claims ?? "", claimAmount: m.claimAmount ?? undefined, currentStatusText: m.currentStatusText ?? "",
          lastActionText: m.lastActionText ?? "", nextActionText: m.nextActionText ?? "", internalNotes: m.internalNotes ?? "", riskFlags: m.riskFlags as never,
          billingType: m.billingType, feeAmount: m.feeAmount ?? undefined, hourlyRate: m.hourlyRate ?? undefined, feeNotes: m.feeNotes ?? "", portalEnabled: m.portalEnabled,
          portalStatusText: m.portalStatusText ?? "",
        }}
        options={{
          caseTypes: ref.caseTypes.map((c) => ({ value: c.id, label: L(c.name, c.nameAr) })),
          jurisdictions: ref.jurisdictions.map((j) => ({ value: j.id, label: L(j.name, j.nameAr) })),
          courts: ref.courts.map((c) => ({ value: c.id, label: L(c.name, c.nameAr), group: c.jurisdictionId })),
          stages: ref.stages.map((s) => ({ value: s.id, label: `${L(s.workflow.name, s.workflow.nameAr)} › ${L(s.name, s.nameAr)}` })),
          staff: ref.staff.map((s) => ({ value: s.id, label: L(s.name, s.nameAr) })),
        }}
      />
    </Panel>
  );
}

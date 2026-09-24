import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/layout";
import { PipelineBoard } from "./board";

export const metadata = { title: "Leads & Pipeline" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("crm.view")) notFound();
  const { t, locale } = await getT();
  const { lead } = await searchParams;
  const [stages, leads, bookings] = await Promise.all([
    db.pipelineStage.findMany({ where: { organizationId: ctx.org.id }, orderBy: { order: "asc" } }),
    db.lead.findMany({ where: { organizationId: ctx.org.id, deletedAt: null }, orderBy: { updatedAt: "desc" }, include: { assignedTo: { select: { id: true, name: true, nameAr: true } }, convertedClient: { select: { id: true } }, bookingRequest: { select: { preferredAt: true, mode: true } } } }),
    db.bookingRequest.count({ where: { organizationId: ctx.org.id, status: "NEW" } }),
  ]);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("crm.title")} subtitle={t("crm.subtitle")} />
      <PipelineBoard
        focus={lead ?? null}
        canManage={ctx.can("crm.manage")}
        canSettings={ctx.can("settings.manage")}
        newBookings={bookings}
        stages={stages.map((s) => ({ id: s.id, name: L(s.name, s.nameAr), nameEn: s.name, nameAr: s.nameAr ?? "", kind: s.kind as "OPEN" | "WON" | "LOST" }))}
        leads={leads.map((l) => ({
          id: l.id, name: l.name, email: l.email ?? "", phone: l.phone ?? "", source: l.source ?? "", inquiry: l.inquiry ?? "", service: l.service ?? "", estimatedValue: l.estimatedValue == null ? null : Number(l.estimatedValue),
          stageId: l.stageId, assignedTo: l.assignedTo ? { id: l.assignedTo.id, name: L(l.assignedTo.name, l.assignedTo.nameAr) } : null, nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
          lostReason: l.lostReason, clientId: l.convertedClient?.id ?? null, booking: l.bookingRequest ? { at: l.bookingRequest.preferredAt.toISOString(), mode: l.bookingRequest.mode } : null,
        }))}
      />
    </div>
  );
}

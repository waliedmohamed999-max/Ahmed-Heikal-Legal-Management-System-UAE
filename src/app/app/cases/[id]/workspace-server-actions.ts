"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { updateMatter } from "@/server/services/matters";
import { matterUpdateSchema } from "@/lib/schemas";

/** Status change reuses the full update path (permissions, audit, automations, reminders). */
export const setCaseStatusAction = staffAction(z.object({ id: z.string().uuid(), status: z.enum(["ACTIVE", "CLOSED", "ARCHIVED", "PENDING", "ON_HOLD"]) }), async ({ id, status }, ctx) => {
  const m = await db.matter.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!m) throw notFound();
  await updateMatter(ctx, matterUpdateSchema.parse({
    id, status, title: m.title, titleAr: m.titleAr ?? "", officialCaseNumber: m.officialCaseNumber ?? "", kind: m.kind, priority: m.priority, confidentiality: m.confidentiality,
    caseTypeId: m.caseTypeId ?? "", jurisdictionId: m.jurisdictionId ?? "", courtId: m.courtId ?? "", stageId: m.stageId ?? "", leadLawyerId: m.leadLawyerId ?? "",
    summary: m.summary ?? "", claims: m.claims ?? "", claimAmount: m.claimAmount == null ? undefined : Number(m.claimAmount), currentStatusText: m.currentStatusText ?? "",
    lastActionText: m.lastActionText ?? "", nextActionText: m.nextActionText ?? "", internalNotes: m.internalNotes ?? "", riskFlags: m.riskFlags as never,
    billingType: m.billingType, feeAmount: m.feeAmount == null ? undefined : Number(m.feeAmount), hourlyRate: m.hourlyRate == null ? undefined : Number(m.hourlyRate),
    feeNotes: m.feeNotes ?? "", portalEnabled: m.portalEnabled, portalStatusText: m.portalStatusText ?? "",
  }));
  revalidatePath(`/app/cases/${id}`, "layout");
  return { ok: true };
});

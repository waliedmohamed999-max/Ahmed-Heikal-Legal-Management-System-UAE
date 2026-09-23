import "server-only";
import { z } from "zod";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, notFound } from "../errors";
import { audit, diff } from "../audit";
import { assertPermission } from "./access";
import { notify } from "./notifications";
import { nextClientNumber } from "./matters";
import { bookingSchema, leadSchema } from "@/lib/crm-schemas";

export { bookingSchema };

export async function saveLead(ctx: StaffContext, input: z.output<typeof leadSchema>) {
  assertPermission(ctx, "crm.manage");
  const stage = await db.pipelineStage.findFirst({ where: { id: input.stageId, organizationId: ctx.org.id } });
  if (!stage) throw new AppError("validation", 400, { stageId: "invalid" });
  const data = {
    name: input.name, email: input.email || null, phone: input.phone || null, source: input.source || null, inquiry: input.inquiry || null, service: input.service || null,
    estimatedValue: input.estimatedValue ?? null, assignedToId: input.assignedToId || null, stageId: input.stageId,
    nextFollowUpAt: input.nextFollowUpAt ? new Date(`${input.nextFollowUpAt}T10:00:00+04:00`) : null,
  };
  if (input.id) {
    const before = await db.lead.findFirst({ where: { id: input.id, organizationId: ctx.org.id, deletedAt: null } });
    if (!before) throw notFound();
    const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
    await db.lead.update({ where: { id: before.id }, data });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "lead.updated", entityType: "Lead", entityId: before.id, before: d.before, after: d.after });
    return { id: before.id };
  }
  const l = await db.lead.create({ data: { ...data, organizationId: ctx.org.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "lead.created", entityType: "Lead", entityId: l.id, after: { name: l.name, source: l.source } });
  if (l.assignedToId) await notify({ organizationId: ctx.org.id, userIds: [l.assignedToId], excludeUserId: ctx.user.id, category: "CLIENT", titleKey: "notif.newBooking", params: { name: l.name }, link: `/app/crm?lead=${l.id}` });
  return { id: l.id };
}

export async function moveLead(ctx: StaffContext, id: string, stageId: string, lostReason?: string | null) {
  assertPermission(ctx, "crm.manage");
  const [lead, stage] = await Promise.all([
    db.lead.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } }),
    db.pipelineStage.findFirst({ where: { id: stageId, organizationId: ctx.org.id } }),
  ]);
  if (!lead || !stage) throw notFound();
  await db.lead.update({ where: { id }, data: { stageId, lostReason: stage.kind === "LOST" ? lostReason ?? lead.lostReason : null } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "lead.stage_changed", entityType: "Lead", entityId: id, before: { stageId: lead.stageId }, after: { stageId } });
}

/** Lead → Client. The case itself is then opened through the intake wizard (with conflict check). */
export async function convertLead(ctx: StaffContext, id: string, type: "INDIVIDUAL" | "COMPANY") {
  assertPermission(ctx, "crm.manage");
  assertPermission(ctx, "clients.create");
  const lead = await db.lead.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null }, include: { convertedClient: true } });
  if (!lead) throw notFound();
  if (lead.convertedClient) return { clientId: lead.convertedClient.id };
  const won = await db.pipelineStage.findFirst({ where: { organizationId: ctx.org.id, kind: "WON" }, orderBy: { order: "asc" } });
  return db.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: { organizationId: ctx.org.id, clientNumber: await nextClientNumber(tx, ctx.org.id), type, nameEn: lead.name, email: lead.email, phone: lead.phone, source: lead.source, leadId: lead.id, createdById: ctx.user.id, notes: lead.inquiry },
    });
    if (won) await tx.lead.update({ where: { id }, data: { stageId: won.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "lead.converted", entityType: "Lead", entityId: id, after: { clientId: c.id } }, tx);
    return { clientId: c.id };
  });
}

export async function deleteLead(ctx: StaffContext, id: string) {
  assertPermission(ctx, "crm.manage");
  const r = await db.lead.updateMany({ where: { id, organizationId: ctx.org.id }, data: { deletedAt: new Date() } });
  if (!r.count) throw notFound();
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "lead.deleted", entityType: "Lead", entityId: id });
}

export async function savePipelineStages(ctx: StaffContext, stages: { id?: string; name: string; nameAr?: string; kind: "OPEN" | "WON" | "LOST" }[]) {
  assertPermission(ctx, "settings.manage");
  await db.$transaction(async (tx) => {
    const existing = await tx.pipelineStage.findMany({ where: { organizationId: ctx.org.id }, include: { _count: { select: { leads: true } } } });
    for (const [order, s] of stages.entries()) {
      if (s.id && existing.some((e) => e.id === s.id)) await tx.pipelineStage.update({ where: { id: s.id }, data: { name: s.name, nameAr: s.nameAr || null, kind: s.kind, order } });
      else await tx.pipelineStage.create({ data: { organizationId: ctx.org.id, name: s.name, nameAr: s.nameAr || null, kind: s.kind, order } });
    }
    for (const e of existing) if (!stages.some((s) => s.id === e.id) && e._count.leads === 0) await tx.pipelineStage.delete({ where: { id: e.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "settings.pipeline_changed", after: stages }, tx);
  });
}

// ─────────────────────────── Public website booking ───────────────────────────
/** Website → Lead → Notification → Appointment request. Runs without a session (public). */
export async function createBooking(orgId: string, input: z.output<typeof bookingSchema>, meta: { ip: string | null; locale: string }) {
  const preferredAt = new Date(`${input.date}T${input.time}:00+04:00`);
  if (Number.isNaN(preferredAt.getTime()) || preferredAt < new Date()) throw new AppError("validation", 400, { date: "date" });
  const [area, firstStage] = await Promise.all([
    input.practiceAreaId ? db.practiceArea.findFirst({ where: { id: input.practiceAreaId, organizationId: orgId, published: true } }) : null,
    db.pipelineStage.findFirst({ where: { organizationId: orgId, kind: "OPEN" }, orderBy: { order: "asc" } }),
  ]);
  if (!firstStage) throw new AppError("unexpected", 500);
  const recipients = await db.user.findMany({ where: { organizationId: orgId, kind: "STAFF", status: "ACTIVE", role: { permissions: { some: { permissionKey: "crm.manage" } } } }, select: { id: true } });
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: { organizationId: orgId, name: input.name, email: input.email, phone: input.phone, source: "WEBSITE", inquiry: input.description || null, service: area?.titleEn ?? null, stageId: firstStage.id, nextFollowUpAt: new Date(Date.now() + 86400_000) },
    });
    const booking = await tx.bookingRequest.create({
      data: { organizationId: orgId, practiceAreaId: area?.id ?? null, serviceLabel: area?.titleEn ?? null, preferredAt, mode: input.mode, name: input.name, phone: input.phone, email: input.email, description: input.description || null, locale: meta.locale, leadId: lead.id, consentAt: new Date(), ip: meta.ip },
    });
    await tx.appointment.create({
      data: { organizationId: orgId, type: input.mode === "ONLINE" ? "ONLINE_MEETING" : "CONSULTATION", title: `Consultation request — ${input.name}`, startsAt: preferredAt, endsAt: new Date(preferredAt.getTime() + 60 * 60_000), leadId: lead.id, status: "REQUESTED", notes: input.description || null },
    });
    await audit({ organizationId: orgId, action: "booking.received", entityType: "BookingRequest", entityId: booking.id, metadata: { ip: meta.ip, leadId: lead.id } }, tx);
    await notify({ organizationId: orgId, userIds: recipients.map((r) => r.id), category: "CLIENT", titleKey: "notif.newBooking", params: { name: input.name }, link: `/app/crm?lead=${lead.id}` }, tx);
    return { id: booking.id };
  });
}

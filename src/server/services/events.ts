import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit, diff } from "../audit";
import { assertMatter, assertPermission } from "./access";
import { logActivity, timelineEvent } from "./activity";
import { notify } from "./notifications";
import { cancelReminders, syncReminders } from "./reminders";
import { runAutomations } from "./automation";
import { appointmentSchema, deadlineSchema, hearingReportSchema, hearingSchema } from "@/lib/schemas";
import { fromZonedLocal } from "@/lib/time";

type HearingInput = z.output<typeof hearingSchema>;

async function assertStaffUser(tx: Tx, orgId: string, userId: string | null | undefined) {
  if (!userId) return;
  const u = await tx.user.findFirst({ where: { id: userId, organizationId: orgId, kind: "STAFF", status: "ACTIVE" }, select: { id: true } });
  if (!u) throw new AppError("validation", 400, { assigneeId: "invalid" });
}

// ═══════════════════════════ Hearings ═══════════════════════════
async function insertHearing(ctx: StaffContext, tx: Tx, input: HearingInput, extra: Partial<Prisma.HearingUncheckedCreateInput> = {}) {
  const tz = ctx.org.timezone;
  const startsAt = fromZonedLocal(input.startsAt, tz);
  const endsAt = input.endsAt ? fromZonedLocal(input.endsAt, tz) : new Date(startsAt.getTime() + 60 * 60_000);
  if (endsAt <= startsAt) throw new AppError("validation", 400, { endsAt: "endBeforeStart" });
  await assertStaffUser(tx, ctx.org.id, input.attendingLawyerId);
  const matter = await tx.matter.findUniqueOrThrow({ where: { id: input.matterId }, select: { id: true, internalNumber: true, leadLawyerId: true, ownerId: true, courtId: true } });
  const h = await tx.hearing.create({
    data: {
      organizationId: ctx.org.id, matterId: input.matterId, courtId: input.courtId ?? matter.courtId, courtRoom: input.courtRoom, isRemote: input.isRemote,
      remoteUrl: input.remoteUrl, startsAt, endsAt, judge: input.judge, sessionType: input.sessionType, attendingLawyerId: input.attendingLawyerId ?? matter.leadLawyerId,
      clientAttendance: input.clientAttendance, requiredDocuments: input.requiredDocuments, preparationNotes: input.preparationNotes,
      status: input.status ?? "SCHEDULED", createdById: ctx.user.id, updatedById: ctx.user.id, ...extra,
    },
  });
  await syncReminders(tx, "HEARING", h.id);
  await timelineEvent(tx, { matterId: matter.id, eventType: "HEARING_SCHEDULED", title: h.sessionType ?? "Hearing", occurredAt: new Date(), userId: ctx.user.id, description: startsAt.toISOString() });
  await logActivity({ organizationId: ctx.org.id, matterId: matter.id, actorId: ctx.user.id, type: "hearing.created", entityType: "Hearing", entityId: h.id, data: { title: h.sessionType ?? "" } }, tx);
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "hearing.created", entityType: "Hearing", entityId: h.id, matterId: matter.id, after: { startsAt, courtId: h.courtId, attendingLawyerId: h.attendingLawyerId } }, tx);
  await runAutomations(tx, "hearing.created", {
    organizationId: ctx.org.id, actorId: ctx.user.id, entityId: h.id, eventAt: startsAt, matter, hearing: { attendingLawyerId: h.attendingLawyerId },
    label: h.sessionType ?? matter.internalNumber, locale: ctx.user.locale === "en" ? "en" : "ar",
  });
  await notify({ organizationId: ctx.org.id, userIds: [h.attendingLawyerId], excludeUserId: ctx.user.id, category: "HEARING", titleKey: "notif.auto.hearing.created", params: { number: matter.internalNumber }, link: `/app/cases/${matter.id}/hearings?h=${h.id}` }, tx);
  return h;
}

export async function createHearing(ctx: StaffContext, input: HearingInput) {
  await assertMatter(ctx, input.matterId, "hearings.manage");
  const h = await db.$transaction((tx) => insertHearing(ctx, tx, input));
  return { id: h.id };
}

export async function updateHearing(ctx: StaffContext, input: HearingInput & { id: string }) {
  const before = await db.hearing.findFirst({ where: { id: input.id, organizationId: ctx.org.id, deletedAt: null } });
  if (!before) throw notFound();
  await assertMatter(ctx, before.matterId, "hearings.manage");
  if (input.matterId !== before.matterId) throw new AppError("validation", 400);
  const tz = ctx.org.timezone;
  const startsAt = fromZonedLocal(input.startsAt, tz);
  const endsAt = input.endsAt ? fromZonedLocal(input.endsAt, tz) : new Date(startsAt.getTime() + (before.endsAt ? before.endsAt.getTime() - before.startsAt.getTime() : 3600_000));
  if (endsAt <= startsAt) throw new AppError("validation", 400, { endsAt: "endBeforeStart" });
  const data = {
    courtId: input.courtId, courtRoom: input.courtRoom, isRemote: input.isRemote, remoteUrl: input.remoteUrl, startsAt, endsAt, judge: input.judge,
    sessionType: input.sessionType, attendingLawyerId: input.attendingLawyerId, clientAttendance: input.clientAttendance, requiredDocuments: input.requiredDocuments,
    preparationNotes: input.preparationNotes, status: input.status ?? before.status,
  };
  const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
  if (!d.changed.length) return { id: before.id };
  const rescheduled = before.startsAt.getTime() !== startsAt.getTime();
  const cancelled = data.status === "CANCELLED" && before.status !== "CANCELLED";

  await db.$transaction(async (tx) => {
    await assertStaffUser(tx, ctx.org.id, input.attendingLawyerId);
    await tx.hearing.update({ where: { id: before.id }, data: { ...data, updatedById: ctx.user.id, acknowledgedAt: rescheduled || d.changed.includes("attendingLawyerId") ? null : undefined } });
    const matter = await tx.matter.findUniqueOrThrow({ where: { id: before.matterId }, select: { id: true, internalNumber: true, leadLawyerId: true } });

    if (rescheduled) {
      // Linked preparation tasks follow the hearing by the same delta (rule: keep relative timing).
      const delta = startsAt.getTime() - before.startsAt.getTime();
      const linked = await tx.task.findMany({ where: { sourceId: before.id, sourceType: { startsWith: "AUTOMATION:" }, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, deletedAt: null } });
      for (const t of linked) {
        if (!t.dueAt) continue;
        await tx.task.update({ where: { id: t.id }, data: { dueAt: new Date(t.dueAt.getTime() + delta) } });
        await syncReminders(tx, "TASK", t.id);
      }
      await timelineEvent(tx, { matterId: matter.id, eventType: "HEARING_RESCHEDULED", title: before.sessionType ?? "Hearing", description: `${before.startsAt.toISOString()} → ${startsAt.toISOString()}`, userId: ctx.user.id });
      await notify({
        organizationId: ctx.org.id, userIds: [data.attendingLawyerId ?? before.attendingLawyerId, matter.leadLawyerId], excludeUserId: ctx.user.id, category: "HEARING",
        titleKey: "notif.hearingChanged", params: { title: before.sessionType ?? matter.internalNumber }, link: `/app/cases/${matter.id}/hearings?h=${before.id}`, requiresAck: true,
        entityType: "HEARING", entityId: before.id,
      }, tx);
    }
    if (cancelled) {
      await cancelReminders(tx, "HEARING", before.id);
      await tx.task.updateMany({ where: { sourceId: before.id, sourceType: { startsWith: "AUTOMATION:" }, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }, data: { status: "CANCELLED" } });
    } else {
      await syncReminders(tx, "HEARING", before.id);
    }
    await logActivity({ organizationId: ctx.org.id, matterId: matter.id, actorId: ctx.user.id, type: rescheduled ? "hearing.rescheduled" : "hearing.updated", entityType: "Hearing", entityId: before.id, data: { title: before.sessionType ?? "" } }, tx);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: rescheduled ? "hearing.rescheduled" : "hearing.updated", entityType: "Hearing", entityId: before.id, matterId: matter.id, before: d.before, after: d.after }, tx);
  });
  return { id: before.id, rescheduled };
}

/**
 * Hearing report: records the outcome and — in the same transaction — creates the
 * next hearing, a confirmed deadline, follow-up tasks, reminders and notifications.
 */
export async function submitHearingReport(ctx: StaffContext, input: z.output<typeof hearingReportSchema>) {
  const h = await db.hearing.findFirst({ where: { id: input.hearingId, organizationId: ctx.org.id, deletedAt: null }, include: { matter: { select: { id: true, internalNumber: true, leadLawyerId: true, ownerId: true } } } });
  if (!h) throw notFound();
  await assertMatter(ctx, h.matterId, "hearings.report");
  const tz = ctx.org.timezone;
  const result = await db.$transaction(async (tx) => {
    const nextAt = input.nextHearingAt ? fromZonedLocal(input.nextHearingAt, tz) : null;
    await tx.hearing.update({
      where: { id: h.id },
      data: { outcome: input.outcome, decisions: input.decisions, requiredActions: input.requiredActions, status: nextAt && input.adjourned ? "ADJOURNED" : "HELD", reportedAt: new Date(), reportedById: ctx.user.id, updatedById: ctx.user.id },
    });
    await cancelReminders(tx, "HEARING", h.id);
    let nextHearingId: string | null = null;
    if (nextAt) {
      const existingNext = await tx.hearing.findUnique({ where: { previousHearingId: h.id } });
      if (existingNext) throw new AppError("conflict", 409);
      const nh = await insertHearing(
        ctx, tx,
        {
          id: null, matterId: h.matterId, courtId: h.courtId, courtRoom: h.courtRoom, isRemote: h.isRemote, remoteUrl: h.remoteUrl, startsAt: input.nextHearingAt!,
          endsAt: null, judge: h.judge, sessionType: input.nextSessionType ?? h.sessionType, attendingLawyerId: input.responsibleId ?? h.attendingLawyerId,
          clientAttendance: h.clientAttendance, requiredDocuments: input.requiredActions, preparationNotes: null, status: "SCHEDULED",
        },
        { previousHearingId: h.id },
      );
      nextHearingId = nh.id;
    }
    let deadlineId: string | null = null;
    if (input.deadlineAt) {
      // Entered by the reporting lawyer from the court's decision → confirmed at source.
      const dl = await tx.deadline.create({
        data: {
          organizationId: ctx.org.id, matterId: h.matterId, hearingId: h.id, type: input.deadlineType, title: input.deadlineTitle || input.requiredActions?.slice(0, 200) || "Court deadline",
          dueAt: fromZonedLocal(input.deadlineAt, tz), isCritical: ["APPEAL", "SUBMISSION", "COURT_APPOINTMENT"].includes(input.deadlineType), assigneeId: input.responsibleId ?? h.matter.leadLawyerId,
          source: "HEARING_REPORT", verification: "CONFIRMED", verifiedById: ctx.user.id, verifiedAt: new Date(), createdById: ctx.user.id,
        },
      });
      await syncReminders(tx, "DEADLINE", dl.id);
      deadlineId = dl.id;
    }
    for (const tk of input.tasks) {
      const task = await tx.task.create({
        data: {
          organizationId: ctx.org.id, matterId: h.matterId, title: tk.title, assigneeId: tk.assigneeId ?? input.responsibleId ?? h.matter.leadLawyerId, createdById: ctx.user.id,
          priority: "HIGH", dueAt: tk.dueAt ? fromZonedLocal(tk.dueAt, tz) : null, sourceType: "HEARING_REPORT", sourceId: h.id,
        },
      });
      await syncReminders(tx, "TASK", task.id);
      await notify({ organizationId: ctx.org.id, userIds: [task.assigneeId], excludeUserId: ctx.user.id, category: "TASK", titleKey: "notif.assignedTask", params: { title: task.title }, link: `/app/tasks?task=${task.id}` }, tx);
    }
    await timelineEvent(tx, { matterId: h.matterId, eventType: "HEARING_REPORT", title: h.sessionType ?? "Hearing", description: [input.outcome, input.decisions].filter(Boolean).join("\n\n"), occurredAt: h.startsAt, userId: ctx.user.id });
    await tx.matter.update({ where: { id: h.matterId }, data: { lastActionText: input.decisions || input.outcome, nextActionText: input.requiredActions ?? undefined } });
    await logActivity({ organizationId: ctx.org.id, matterId: h.matterId, actorId: ctx.user.id, type: "hearing.reported", entityType: "Hearing", entityId: h.id, data: { title: h.sessionType ?? "" } }, tx);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "hearing.reported", entityType: "Hearing", entityId: h.id, matterId: h.matterId, after: { outcome: input.outcome, nextHearingId, deadlineId, tasks: input.tasks.length } }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [h.matter.ownerId, h.matter.leadLawyerId], excludeUserId: ctx.user.id, category: "HEARING", titleKey: "notif.hearingReportDue", params: { title: h.sessionType ?? h.matter.internalNumber }, link: `/app/cases/${h.matterId}/hearings?h=${h.id}` }, tx);
    return { nextHearingId, deadlineId };
  });
  return result;
}

/** Preparation workspace fields (questions, arguments, notes) and the PREPARING → READY state. */
export async function saveHearingPrep(ctx: StaffContext, id: string, p: { questions?: string | null; arguments?: string | null; preparationNotes?: string | null; status?: "PREPARING" | "READY" }) {
  const h = await db.hearing.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!h) throw notFound();
  await assertMatter(ctx, h.matterId, "hearings.manage");
  await db.hearing.update({ where: { id }, data: { questions: p.questions ?? undefined, arguments: p.arguments ?? undefined, preparationNotes: p.preparationNotes ?? undefined, status: p.status ?? undefined, updatedById: ctx.user.id } });
  if (p.status && p.status !== h.status) {
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "hearing.status_changed", entityType: "Hearing", entityId: id, matterId: h.matterId, before: { status: h.status }, after: { status: p.status } });
  }
}

export async function acknowledgeHearing(ctx: StaffContext, id: string) {
  const h = await db.hearing.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!h) throw notFound();
  await assertMatter(ctx, h.matterId, "hearings.view");
  if (h.attendingLawyerId !== ctx.user.id) throw forbidden();
  await db.hearing.update({ where: { id }, data: { acknowledgedAt: new Date() } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "hearing.acknowledged", entityType: "Hearing", entityId: id, matterId: h.matterId });
}

// ═══════════════════════════ Deadlines ═══════════════════════════
export async function saveDeadline(ctx: StaffContext, input: z.output<typeof deadlineSchema>) {
  if (input.matterId) await assertMatter(ctx, input.matterId, "deadlines.manage");
  else assertPermission(ctx, "deadlines.manage");
  const dueAt = fromZonedLocal(input.dueAt, ctx.org.timezone);
  return db.$transaction(async (tx) => {
    await assertStaffUser(tx, ctx.org.id, input.assigneeId);
    if (input.id) {
      const before = await tx.deadline.findFirst({ where: { id: input.id, organizationId: ctx.org.id, deletedAt: null } });
      if (!before) throw notFound();
      if (before.matterId !== input.matterId) throw new AppError("validation", 400);
      const data = { type: input.type, title: input.title, description: input.description, dueAt, isCritical: input.isCritical, assigneeId: input.assigneeId };
      const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      // Changing the date of an AI/imported deadline sends it back to verification.
      const reverify = before.source === "AI" || before.source === "IMPORT" ? d.changed.includes("dueAt") : false;
      await tx.deadline.update({ where: { id: before.id }, data: { ...data, updatedById: ctx.user.id, ...(reverify ? { verification: "NEEDS_VERIFICATION", verifiedById: null, verifiedAt: null } : {}), acknowledgedAt: d.changed.includes("dueAt") ? null : undefined } });
      await syncReminders(tx, "DEADLINE", before.id);
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "deadline.changed", entityType: "Deadline", entityId: before.id, matterId: before.matterId, before: d.before, after: d.after }, tx);
      if (before.matterId) await logActivity({ organizationId: ctx.org.id, matterId: before.matterId, actorId: ctx.user.id, type: "deadline.created", entityType: "Deadline", entityId: before.id, data: { title: input.title } }, tx);
      return { id: before.id };
    }
    const dl = await tx.deadline.create({
      data: {
        organizationId: ctx.org.id, matterId: input.matterId, type: input.type, title: input.title, description: input.description, dueAt, isCritical: input.isCritical,
        assigneeId: input.assigneeId ?? ctx.user.id, createdById: ctx.user.id, updatedById: ctx.user.id, source: "MANUAL", verification: "CONFIRMED", verifiedById: ctx.user.id, verifiedAt: new Date(),
      },
    });
    await syncReminders(tx, "DEADLINE", dl.id);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "deadline.created", entityType: "Deadline", entityId: dl.id, matterId: dl.matterId, after: { title: dl.title, dueAt } }, tx);
    if (dl.matterId) await logActivity({ organizationId: ctx.org.id, matterId: dl.matterId, actorId: ctx.user.id, type: "deadline.created", entityType: "Deadline", entityId: dl.id, data: { title: dl.title } }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [dl.assigneeId], excludeUserId: ctx.user.id, category: "DEADLINE", titleKey: "notif.reminder.DEADLINE", params: { title: dl.title }, link: dl.matterId ? `/app/cases/${dl.matterId}/deadlines` : "/app/agenda" }, tx);
    return { id: dl.id };
  });
}

/** An AI/imported deadline becomes a confirmed legal deadline only when an authorised lawyer verifies it. */
export async function verifyDeadline(ctx: StaffContext, id: string, approve: boolean, correctedDueAt?: string | null) {
  const d = await db.deadline.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!d) throw notFound();
  if (d.matterId) await assertMatter(ctx, d.matterId, "deadlines.verify");
  else assertPermission(ctx, "deadlines.verify");
  await db.$transaction(async (tx) => {
    if (approve) {
      await tx.deadline.update({
        where: { id },
        data: { verification: "CONFIRMED", verifiedById: ctx.user.id, verifiedAt: new Date(), dueAt: correctedDueAt ? fromZonedLocal(correctedDueAt, ctx.org.timezone) : undefined },
      });
      await syncReminders(tx, "DEADLINE", id);
    } else {
      await tx.deadline.update({ where: { id }, data: { status: "CANCELLED", updatedById: ctx.user.id } });
      await cancelReminders(tx, "DEADLINE", id);
    }
    await tx.approval.updateMany({ where: { entityType: "Deadline", entityId: id, status: "PENDING" }, data: { status: approve ? "APPROVED" : "REJECTED", decidedAt: new Date(), assignedToId: ctx.user.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: approve ? "deadline.verified" : "deadline.rejected", entityType: "Deadline", entityId: id, matterId: d.matterId, before: { dueAt: d.dueAt, verification: d.verification }, after: { correctedDueAt } }, tx);
    if (d.matterId) await logActivity({ organizationId: ctx.org.id, matterId: d.matterId, actorId: ctx.user.id, type: "deadline.verified", entityType: "Deadline", entityId: id, data: { title: d.title } }, tx);
  });
}

export async function setDeadlineStatus(ctx: StaffContext, id: string, status: "OPEN" | "DONE" | "CANCELLED") {
  const d = await db.deadline.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!d) throw notFound();
  if (d.matterId) await assertMatter(ctx, d.matterId, "deadlines.manage");
  else if (d.assigneeId !== ctx.user.id && d.createdById !== ctx.user.id) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.deadline.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null, updatedById: ctx.user.id } });
    await syncReminders(tx, "DEADLINE", id);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "deadline.status_changed", entityType: "Deadline", entityId: id, matterId: d.matterId, before: { status: d.status }, after: { status } }, tx);
    if (d.matterId && status === "DONE") await logActivity({ organizationId: ctx.org.id, matterId: d.matterId, actorId: ctx.user.id, type: "deadline.completed", entityType: "Deadline", entityId: id, data: { title: d.title } }, tx);
  });
}

// ═══════════════════════════ Appointments ═══════════════════════════
export async function saveAppointment(ctx: StaffContext, input: z.output<typeof appointmentSchema>) {
  assertPermission(ctx, "appointments.manage");
  if (input.matterId) await assertMatter(ctx, input.matterId, "matters.view");
  const startsAt = fromZonedLocal(input.startsAt, ctx.org.timezone);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  return db.$transaction(async (tx) => {
    await assertStaffUser(tx, ctx.org.id, input.lawyerId);
    if (input.clientId && !(await tx.client.findFirst({ where: { id: input.clientId, organizationId: ctx.org.id } }))) throw notFound();
    const data = {
      type: input.type, title: input.title, startsAt, endsAt, lawyerId: input.lawyerId ?? ctx.user.id, clientId: input.clientId, matterId: input.matterId, leadId: input.leadId,
      location: input.location, meetingUrl: input.meetingUrl, notes: input.notes, portalVisible: input.portalVisible,
    };
    if (input.id) {
      const before = await tx.appointment.findFirst({ where: { id: input.id, organizationId: ctx.org.id, deletedAt: null } });
      if (!before) throw notFound();
      const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      await tx.appointment.update({ where: { id: before.id }, data });
      await syncReminders(tx, "APPOINTMENT", before.id);
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "appointment.updated", entityType: "Appointment", entityId: before.id, matterId: before.matterId, before: d.before, after: d.after }, tx);
      return { id: before.id };
    }
    const a = await tx.appointment.create({ data: { ...data, organizationId: ctx.org.id, createdById: ctx.user.id } });
    await syncReminders(tx, "APPOINTMENT", a.id);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "appointment.created", entityType: "Appointment", entityId: a.id, matterId: a.matterId, after: { title: a.title, startsAt } }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [a.lawyerId], excludeUserId: ctx.user.id, category: "CLIENT", titleKey: "notif.reminder.APPOINTMENT", params: { title: a.title }, link: `/app/calendar?focus=${a.id}` }, tx);
    return { id: a.id };
  });
}

export async function setAppointmentStatus(ctx: StaffContext, id: string, status: "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW") {
  assertPermission(ctx, "appointments.manage");
  const a = await db.appointment.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!a) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id }, data: { status } });
    await syncReminders(tx, "APPOINTMENT", id);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "appointment.status_changed", entityType: "Appointment", entityId: id, before: { status: a.status }, after: { status } }, tx);
  });
}

/**
 * Drag & drop move — only for items that are safe to move (appointments and task
 * due dates). Court hearings and legal deadlines are never moved by dragging.
 */
export async function moveAgendaItem(ctx: StaffContext, kind: "APPOINTMENT" | "TASK", id: string, newStartIso: string) {
  const start = new Date(newStartIso);
  if (Number.isNaN(start.getTime())) throw new AppError("validation", 400);
  if (kind === "APPOINTMENT") {
    assertPermission(ctx, "appointments.manage");
    const a = await db.appointment.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
    if (!a) throw notFound();
    if (a.matterId) await assertMatter(ctx, a.matterId, "matters.view");
    const dur = a.endsAt.getTime() - a.startsAt.getTime();
    await db.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id }, data: { startsAt: start, endsAt: new Date(start.getTime() + dur) } });
      await syncReminders(tx, "APPOINTMENT", id);
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "appointment.moved", entityType: "Appointment", entityId: id, before: { startsAt: a.startsAt }, after: { startsAt: start } }, tx);
    });
  } else {
    const t = await db.task.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
    if (!t) throw notFound();
    if (t.matterId) await assertMatter(ctx, t.matterId, "tasks.manage");
    else if (t.assigneeId !== ctx.user.id && t.createdById !== ctx.user.id) throw notFound();
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { dueAt: start } });
      await syncReminders(tx, "TASK", id);
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "task.rescheduled", entityType: "Task", entityId: id, matterId: t.matterId, before: { dueAt: t.dueAt }, after: { dueAt: start } }, tx);
    });
  }
}

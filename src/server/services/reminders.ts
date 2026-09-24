import { stringList, numberList } from "@/lib/json-lists";
import "server-only";
import { db, type Tx } from "../db";
import { alertLevel, DEFAULT_REMINDER_OFFSETS, reminderSchedule, type AlertThreshold, DEFAULT_THRESHOLDS } from "@/lib/deadline";
import { notify } from "./notifications";
import { channelProvider, deliver, type Channel } from "./channels";

export type SubjectType = "HEARING" | "DEADLINE" | "APPOINTMENT" | "TASK";

type Subject = {
  organizationId: string;
  eventAt: Date;
  active: boolean;
  title: string;
  matterNumber?: string;
  matterId?: string | null;
  recipients: string[];
  ownerId?: string | null;
  acknowledged: boolean;
  link: string;
};

async function loadSubject(tx: Tx, type: SubjectType, id: string): Promise<Subject | null> {
  switch (type) {
    case "HEARING": {
      const h = await tx.hearing.findUnique({
        where: { id },
        include: { matter: { select: { id: true, internalNumber: true, title: true, leadLawyerId: true, ownerId: true, status: true, deletedAt: true } } },
      });
      if (!h) return null;
      return {
        organizationId: h.organizationId,
        eventAt: h.startsAt,
        active: !h.deletedAt && !h.matter.deletedAt && ["SCHEDULED", "PREPARING", "READY"].includes(h.status),
        title: h.sessionType || h.matter.title,
        matterNumber: h.matter.internalNumber,
        matterId: h.matter.id,
        recipients: [h.attendingLawyerId ?? h.matter.leadLawyerId, h.matter.leadLawyerId].filter(Boolean) as string[],
        ownerId: h.matter.ownerId,
        acknowledged: !!h.acknowledgedAt,
        link: `/app/cases/${h.matter.id}/hearings?h=${h.id}`,
      };
    }
    case "DEADLINE": {
      const d = await tx.deadline.findUnique({ where: { id }, include: { matter: { select: { id: true, internalNumber: true, leadLawyerId: true, ownerId: true, deletedAt: true } } } });
      if (!d) return null;
      return {
        organizationId: d.organizationId,
        eventAt: d.dueAt,
        active: !d.deletedAt && d.status === "OPEN" && !d.matter?.deletedAt,
        title: d.title,
        matterNumber: d.matter?.internalNumber,
        matterId: d.matter?.id,
        recipients: [d.assigneeId ?? d.matter?.leadLawyerId].filter(Boolean) as string[],
        ownerId: d.matter?.ownerId,
        acknowledged: !!d.acknowledgedAt,
        link: d.matter ? `/app/cases/${d.matter.id}/deadlines` : "/app/agenda",
      };
    }
    case "APPOINTMENT": {
      const a = await tx.appointment.findUnique({ where: { id } });
      if (!a) return null;
      return {
        organizationId: a.organizationId,
        eventAt: a.startsAt,
        active: !a.deletedAt && ["REQUESTED", "CONFIRMED"].includes(a.status),
        title: a.title,
        matterId: a.matterId,
        recipients: [a.lawyerId].filter(Boolean) as string[],
        acknowledged: false,
        link: `/app/calendar?focus=${a.id}`,
      };
    }
    case "TASK": {
      const t = await tx.task.findUnique({ where: { id }, include: { matter: { select: { internalNumber: true } } } });
      if (!t || !t.dueAt) return null;
      return {
        organizationId: t.organizationId,
        eventAt: t.dueAt,
        active: !t.deletedAt && !["DONE", "CANCELLED"].includes(t.status),
        title: t.title,
        matterNumber: t.matter?.internalNumber,
        matterId: t.matterId,
        recipients: [t.assigneeId].filter(Boolean) as string[],
        acknowledged: false,
        link: `/app/tasks?task=${t.id}`,
      };
    }
  }
}

/**
 * Rebuild pending reminders for one event. Called on every create/update/reschedule/
 * status change, so reminders always follow the current event time.
 */
export async function syncReminders(tx: Tx, type: SubjectType, id: string, now = new Date()) {
  await tx.reminder.updateMany({ where: { subjectType: type, subjectId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
  const s = await loadSubject(tx, type, id);
  if (!s || !s.active || s.eventAt <= now) return 0;

  const policy = await tx.reminderPolicy.findUnique({ where: { organizationId_subjectType: { organizationId: s.organizationId, subjectType: type } } });
  if (policy && !policy.enabled) return 0;
  const offsets = numberList(policy?.offsetsMinutes ?? DEFAULT_REMINDER_OFFSETS[type] ?? []);
  const channels = stringList(policy?.channels ?? ["IN_APP"]);
  const recipients = new Set(s.recipients);
  if (policy?.notifyOwner && s.ownerId) recipients.add(s.ownerId);

  const rows = [];
  for (const userId of recipients) {
    for (const r of reminderSchedule(s.eventAt, offsets, now)) {
      rows.push({ organizationId: s.organizationId, subjectType: type, subjectId: id, userId, fireAt: r.fireAt, offsetMinutes: r.offsetMinutes, channels });
    }
  }
  // Escalation: if the responsible lawyer has not acknowledged by this point, alert the matter owner.
  if (policy?.escalateBeforeMinutes && s.ownerId) {
    const fireAt = new Date(s.eventAt.getTime() - policy.escalateBeforeMinutes * 60_000);
    if (fireAt > now) {
      rows.push({ organizationId: s.organizationId, subjectType: type, subjectId: id, userId: s.ownerId, fireAt, offsetMinutes: policy.escalateBeforeMinutes, channels, kind: "ESCALATION" });
    }
  }
  if (rows.length) await tx.reminder.createMany({ data: rows });
  return rows.length;
}

export async function cancelReminders(tx: Tx, type: SubjectType, id: string) {
  await tx.reminder.updateMany({ where: { subjectType: type, subjectId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
}

const CATEGORY: Record<SubjectType, "HEARING" | "DEADLINE" | "TASK" | "CLIENT"> = { HEARING: "HEARING", DEADLINE: "DEADLINE", APPOINTMENT: "CLIENT", TASK: "TASK" };

export const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;
const backoffMs = (attempt: number) => Math.min(60, 2 ** attempt) * 60_000;

/**
 * Dispatch due reminders (run by the worker). Durable and idempotent:
 *  • Claimed with a lease (PROCESSING + lockedUntil). If the worker dies mid-job the
 *    lease expires and another tick re-claims it — restarts never lose reminders.
 *  • The in-app notification and the SENT mark commit in ONE transaction, and the
 *    notification carries a unique dedupe key (reminder id), so a retry after a crash
 *    can never create a second notification for the user.
 *  • Failures retry with exponential backoff up to MAX_ATTEMPTS, then FAILED.
 */
export async function dispatchDueReminders(now = new Date(), limit = 200) {
  const due = await db.reminder.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] }, fireAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    orderBy: { fireAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  for (const { id } of due) {
    const claimed = await db.reminder.updateMany({
      where: { id, status: { in: ["PENDING", "PROCESSING"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { status: "PROCESSING", lockedUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 }, lastAttemptAt: now },
    });
    if (!claimed.count) continue;
    const r = await db.reminder.findUniqueOrThrow({ where: { id } });
    try {
      const done = await db.$transaction(async (tx) => {
        const s = await loadSubject(tx, r.subjectType as SubjectType, r.subjectId);
        if (!s || !s.active || (r.kind === "ESCALATION" && s.acknowledged)) {
          await tx.reminder.update({ where: { id: r.id }, data: { status: "CANCELLED", lockedUntil: null } });
          return false;
        }
        const org = await tx.organization.findUnique({ where: { id: s.organizationId }, select: { settings: true } });
        const thresholds = ((org?.settings as { alertThresholds?: AlertThreshold[] | null })?.alertThresholds ?? DEFAULT_THRESHOLDS) as AlertThreshold[];
        const level = alertLevel(s.eventAt, now, thresholds);
        const critical = ["IMMEDIATE", "CRITICAL", "OVERDUE"].includes(level);
        await notify(
          {
            organizationId: s.organizationId,
            userIds: [r.userId],
            category: critical || r.kind === "ESCALATION" ? "CRITICAL" : CATEGORY[r.subjectType as SubjectType],
            titleKey: r.kind === "ESCALATION" ? "notif.escalation" : `notif.reminder.${r.subjectType}`,
            bodyKey: "notif.reminderBody",
            params: { title: s.title, number: s.matterNumber ?? "", when: s.eventAt.toISOString(), level },
            link: s.link,
            entityType: r.subjectType,
            entityId: r.subjectId,
            dedupeKey: `reminder:${r.id}`,
            requiresAck: r.subjectType === "HEARING" || r.subjectType === "DEADLINE",
            channels: stringList(r.channels) as Channel[],
          },
          tx,
        );
        await tx.reminder.update({ where: { id: r.id }, data: { status: "SENT", sentAt: now, lockedUntil: null, error: null } });
        return true;
      });
      if (done) sent++;
    } catch (e) {
      const final = r.attempts >= MAX_ATTEMPTS;
      await db.reminder.update({
        where: { id: r.id },
        data: {
          status: final ? "FAILED" : "PENDING",
          lockedUntil: final ? null : new Date(now.getTime() + backoffMs(r.attempts)),
          error: e instanceof Error ? e.message.slice(0, 300) : "error",
        },
      });
    }
  }
  return sent;
}

/**
 * Send queued external deliveries (e-mail / SMS / WhatsApp). Same lease + retry model.
 * In-app delivery is exactly-once (transactional). External providers are at-least-once:
 * a crash after the provider accepted a message but before SENT is recorded can cause
 * one resend — providers expose no idempotency key for plain SMTP.
 */
export async function dispatchPendingDeliveries(now = new Date(), limit = 100) {
  const due = await db.notificationDelivery.findMany({
    where: {
      OR: [
        { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: "SENDING", lockedUntil: { lt: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  for (const { id } of due) {
    const claimed = await db.notificationDelivery.updateMany({
      where: { id, OR: [{ status: "PENDING" }, { status: "SENDING", lockedUntil: { lt: now } }] },
      data: { status: "SENDING", lockedUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 }, lastAttemptAt: now },
    });
    if (!claimed.count) continue;
    const d = await db.notificationDelivery.findUniqueOrThrow({
      where: { id },
      include: { notification: { select: { title: true, body: true, link: true, user: { select: { email: true, phone: true, status: true } } } } },
    });
    const u = d.notification.user;
    const res =
      u.status !== "ACTIVE"
        ? { status: "SKIPPED_NOT_CONNECTED" as const, error: "recipient inactive" }
        : await deliver(d.channel as Channel, { to: { email: u.email, phone: u.phone }, subject: d.notification.title, body: d.notification.body ?? d.notification.title, link: d.notification.link });
    const retry = res.status === "FAILED" && d.attempts < MAX_ATTEMPTS;
    await db.notificationDelivery.update({
      where: { id },
      data: {
        status: retry ? "PENDING" : res.status,
        error: res.error ?? null,
        lockedUntil: null,
        nextAttemptAt: retry ? new Date(now.getTime() + backoffMs(d.attempts)) : null,
        provider: channelProvider(d.channel as Channel),
      },
    });
    if (res.status === "SENT") sent++;
  }
  return sent;
}

/** Expire temporary matter access whose end date has passed. */
export async function expireTemporaryAccess(now = new Date()) {
  const expired = await db.matterMember.findMany({ where: { expiresAt: { lte: now } }, include: { matter: { select: { organizationId: true } } } });
  for (const m of expired) {
    await db.$transaction(async (tx) => {
      await tx.matterMember.delete({ where: { id: m.id } });
      const { audit } = await import("../audit");
      await audit(
        { organizationId: m.matter.organizationId, action: "permission.temporary_access_expired", entityType: "MatterMember", entityId: m.id, matterId: m.matterId, before: { userId: m.userId, role: m.role, expiresAt: m.expiresAt } },
        tx,
      );
    });
  }
  return expired.length;
}

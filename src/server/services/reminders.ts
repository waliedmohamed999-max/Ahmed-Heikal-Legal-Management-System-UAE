import "server-only";
import { db, type Tx } from "../db";
import { alertLevel, DEFAULT_REMINDER_OFFSETS, reminderSchedule, type AlertThreshold, DEFAULT_THRESHOLDS } from "@/lib/deadline";
import { notify } from "./notifications";
import type { Channel } from "./channels";

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
  const offsets = policy?.offsetsMinutes ?? DEFAULT_REMINDER_OFFSETS[type] ?? [];
  const channels = policy?.channels ?? ["IN_APP"];
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

/**
 * Dispatch due reminders. Run by the worker every minute. Idempotent: each reminder
 * is claimed with a conditional update before sending, so concurrent workers never double-send.
 */
export async function dispatchDueReminders(now = new Date(), limit = 200) {
  const due = await db.reminder.findMany({ where: { status: "PENDING", fireAt: { lte: now } }, orderBy: { fireAt: "asc" }, take: limit });
  let sent = 0;
  for (const r of due) {
    const claimed = await db.reminder.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "SENT", sentAt: now } });
    if (!claimed.count) continue;
    try {
      const s = await loadSubject(db, r.subjectType as SubjectType, r.subjectId);
      if (!s || !s.active || (r.kind === "ESCALATION" && s.acknowledged)) {
        await db.reminder.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
        continue;
      }
      const org = await db.organization.findUnique({ where: { id: s.organizationId }, select: { settings: true } });
      const thresholds = ((org?.settings as { alertThresholds?: AlertThreshold[] | null })?.alertThresholds ?? DEFAULT_THRESHOLDS) as AlertThreshold[];
      const level = alertLevel(s.eventAt, now, thresholds);
      const critical = ["IMMEDIATE", "CRITICAL", "OVERDUE"].includes(level);
      await notify({
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
        channels: r.channels as Channel[],
      });
      sent++;
    } catch (e) {
      await db.reminder.update({ where: { id: r.id }, data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 300) : "error" } });
    }
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

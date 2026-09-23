import "server-only";
import type { Prisma, Priority } from "@prisma/client";
import { z } from "zod";
import type { Tx } from "../db";
import { notify } from "./notifications";
import { syncReminders } from "./reminders";

/**
 * Rule engine: WHEN <trigger> [IF <conditions>] THEN <actions>.
 * v1 ships templated rules (seeded, toggleable in Settings → Automations); the
 * schema below is the contract a future visual builder will write to.
 */
const Condition = z.object({ field: z.string(), op: z.enum(["eq", "neq", "in"]), value: z.unknown() });
const Action = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    title: z.string(),
    titleAr: z.string().optional(),
    assignTo: z.string(), // hearing.attendingLawyer | matter.leadLawyer | matter.owner | actor
    dueOffsetMinutes: z.number().optional(), // relative to event time (negative = before)
    priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional(),
  }),
  z.object({ type: z.literal("notify"), to: z.string(), category: z.enum(["CRITICAL", "DEADLINE", "HEARING", "TASK", "DOCUMENT", "CLIENT", "FINANCE", "SYSTEM"]) }),
  z.object({ type: z.literal("cancel_open_tasks") }),
  z.object({ type: z.literal("request_approval"), kind: z.string(), title: z.string(), titleAr: z.string().optional(), assignTo: z.string() }),
]);
export type AutomationAction = z.infer<typeof Action>;

export type TriggerContext = {
  organizationId: string;
  actorId: string;
  matter?: { id: string; internalNumber: string; leadLawyerId: string | null; ownerId: string } | null;
  entityId: string;
  eventAt?: Date | null;
  hearing?: { attendingLawyerId: string | null } | null;
  fields?: Record<string, unknown>;
  label?: string;
  locale?: "ar" | "en";
};

async function resolveUser(tx: Tx, who: string, c: TriggerContext): Promise<string | null> {
  if (who === "actor") return c.actorId;
  if (who === "matter.leadLawyer") return c.matter?.leadLawyerId ?? c.matter?.ownerId ?? null;
  if (who === "matter.owner") return c.matter?.ownerId ?? null;
  if (who === "hearing.attendingLawyer") return c.hearing?.attendingLawyerId ?? c.matter?.leadLawyerId ?? null;
  if (who.startsWith("role:")) {
    const u = await tx.user.findFirst({ where: { organizationId: c.organizationId, status: "ACTIVE", kind: "STAFF", role: { key: who.slice(5) } }, select: { id: true } });
    return u?.id ?? null;
  }
  return null;
}

function matches(conds: z.infer<typeof Condition>[], fields: Record<string, unknown> = {}) {
  return conds.every((c) => {
    const v = fields[c.field];
    if (c.op === "eq") return v === c.value;
    if (c.op === "neq") return v !== c.value;
    return Array.isArray(c.value) && c.value.includes(v);
  });
}

export async function runAutomations(tx: Tx, trigger: string, c: TriggerContext) {
  const rules = await tx.automation.findMany({ where: { organizationId: c.organizationId, trigger, enabled: true } });
  for (const rule of rules) {
    const conds = z.array(Condition).safeParse(rule.conditions);
    const acts = z.array(Action).safeParse(rule.actions);
    if (!conds.success || !acts.success) {
      await tx.automationRun.create({ data: { automationId: rule.id, entityId: c.entityId, status: "FAILED", detail: { error: "invalid rule definition" } } });
      continue;
    }
    if (!matches(conds.data, c.fields)) {
      await tx.automationRun.create({ data: { automationId: rule.id, entityId: c.entityId, status: "SKIPPED" } });
      continue;
    }
    const done: string[] = [];
    for (const a of acts.data) {
      if (a.type === "create_task") {
        const assigneeId = await resolveUser(tx, a.assignTo, c);
        let dueAt: Date | null = null;
        if (c.eventAt && a.dueOffsetMinutes != null) {
          dueAt = new Date(c.eventAt.getTime() + a.dueOffsetMinutes * 60_000);
          if (dueAt < new Date()) dueAt = new Date(Math.min(c.eventAt.getTime(), Date.now() + 2 * 3600_000));
        } else if (a.dueOffsetMinutes != null) {
          dueAt = new Date(Date.now() + a.dueOffsetMinutes * 60_000);
        }
        const title = (c.locale === "ar" && a.titleAr ? a.titleAr : a.title) + (c.label ? ` — ${c.label}` : "");
        const task = await tx.task.create({
          data: {
            organizationId: c.organizationId, matterId: c.matter?.id ?? null, title, assigneeId, createdById: c.actorId,
            priority: (a.priority ?? "NORMAL") as Priority, dueAt, sourceType: `AUTOMATION:${rule.key}`, sourceId: c.entityId,
          },
        });
        await syncReminders(tx, "TASK", task.id);
        done.push(`task:${task.id}`);
      } else if (a.type === "notify") {
        const uid = await resolveUser(tx, a.to, c);
        await notify(
          {
            organizationId: c.organizationId, userIds: [uid], category: a.category, titleKey: `notif.auto.${trigger}`,
            params: { label: c.label ?? "", number: c.matter?.internalNumber ?? "" },
            link: c.matter ? `/app/cases/${c.matter.id}` : undefined, excludeUserId: c.actorId,
          },
          tx,
        );
        done.push("notify");
      } else if (a.type === "cancel_open_tasks" && c.matter) {
        const r = await tx.task.updateMany({ where: { matterId: c.matter.id, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, deletedAt: null }, data: { status: "CANCELLED" } });
        await tx.reminder.updateMany({ where: { subjectType: "TASK", status: "PENDING", subjectId: { in: (await tx.task.findMany({ where: { matterId: c.matter.id, status: "CANCELLED" }, select: { id: true } })).map((t) => t.id) } }, data: { status: "CANCELLED" } });
        done.push(`cancelled:${r.count}`);
      } else if (a.type === "request_approval") {
        const assignedToId = await resolveUser(tx, a.assignTo, c);
        await tx.approval.create({
          data: {
            organizationId: c.organizationId, kind: a.kind, entityType: "Matter", entityId: c.matter?.id ?? c.entityId, matterId: c.matter?.id ?? null,
            title: `${c.locale === "ar" && a.titleAr ? a.titleAr : a.title}${c.matter ? ` — ${c.matter.internalNumber}` : ""}`, requestedById: c.actorId, assignedToId,
          },
        });
        done.push("approval");
      }
    }
    await tx.automationRun.create({ data: { automationId: rule.id, entityId: c.entityId, status: "SUCCEEDED", detail: { done } as Prisma.InputJsonValue } });
  }
}

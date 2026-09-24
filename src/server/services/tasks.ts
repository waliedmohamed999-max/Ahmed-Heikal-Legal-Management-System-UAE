import "server-only";
import { z } from "zod";
import type { Prisma, TaskStatus } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit, diff } from "../audit";
import { assertMatter, assertPermission, matterScopeWhere } from "./access";
import { logActivity } from "./activity";
import { notify } from "./notifications";
import { syncReminders } from "./reminders";
import { taskSchema } from "@/lib/schemas";
import { dayRange, fromZonedLocal } from "@/lib/time";

/** Tasks the user may see: in accessible matters, or unlinked tasks they created / own. */
export function taskScopeWhere(ctx: StaffContext): Prisma.TaskWhereInput {
  return {
    organizationId: ctx.org.id,
    deletedAt: null,
    OR: [{ matter: matterScopeWhere(ctx) }, { matterId: null, OR: [{ assigneeId: ctx.user.id }, { createdById: ctx.user.id }] }],
  };
}

async function assertTaskAccess(ctx: StaffContext, id: string, action: "tasks.view" | "tasks.manage") {
  const t = await db.task.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!t) throw notFound();
  if (t.matterId) await assertMatter(ctx, t.matterId, action);
  else {
    if (t.assigneeId !== ctx.user.id && t.createdById !== ctx.user.id) throw notFound();
    assertPermission(ctx, action);
  }
  return t;
}

export async function saveTask(ctx: StaffContext, input: z.output<typeof taskSchema>) {
  if (input.matterId) await assertMatter(ctx, input.matterId, "tasks.manage");
  else assertPermission(ctx, "tasks.manage");
  const assigneeId = input.assigneeId ?? ctx.user.id;
  if (assigneeId !== ctx.user.id) {
    if (!ctx.can("tasks.assign")) throw forbidden();
    const u = await db.user.findFirst({ where: { id: assigneeId, organizationId: ctx.org.id, kind: "STAFF", status: "ACTIVE" } });
    if (!u) throw new AppError("validation", 400, { assigneeId: "invalid" });
  }
  const tz = ctx.org.timezone;
  const data = {
    matterId: input.matterId, title: input.title, description: input.description, assigneeId, priority: input.priority, status: input.status,
    startAt: input.startAt ? fromZonedLocal(input.startAt, tz) : null, dueAt: input.dueAt ? fromZonedLocal(input.dueAt, tz) : null, estimateMinutes: input.estimateMinutes,
  };
  return db.$transaction(async (tx) => {
    if (input.dependsOn?.length) {
      const deps = await tx.task.count({ where: { id: { in: input.dependsOn }, organizationId: ctx.org.id } });
      if (deps !== input.dependsOn.length) throw new AppError("validation", 400, { dependsOn: "invalid" });
    }
    if (input.id) {
      const before = await tx.task.findFirst({ where: { id: input.id, organizationId: ctx.org.id, deletedAt: null } });
      if (!before) throw notFound();
      if (before.matterId !== input.matterId && before.matterId) await assertMatter(ctx, before.matterId, "tasks.manage");
      const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      await tx.task.update({ where: { id: before.id }, data: { ...data, completedAt: data.status === "DONE" ? before.completedAt ?? new Date() : null } });
      if (input.dependsOn) {
        await tx.taskDependency.deleteMany({ where: { taskId: before.id } });
        if (input.dependsOn.length) await tx.taskDependency.createMany({ data: input.dependsOn.filter((x) => x !== before.id).map((dependsOnId) => ({ taskId: before.id, dependsOnId })) });
      }
      await syncReminders(tx, "TASK", before.id);
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "task.updated", entityType: "Task", entityId: before.id, matterId: before.matterId, before: d.before, after: d.after }, tx);
      if (d.changed.includes("assigneeId")) await notify({ organizationId: ctx.org.id, userIds: [assigneeId], excludeUserId: ctx.user.id, category: "TASK", titleKey: "notif.assignedTask", params: { title: input.title }, link: `/app/tasks?task=${before.id}` }, tx);
      return { id: before.id };
    }
    const t = await tx.task.create({
      data: {
        ...data, organizationId: ctx.org.id, createdById: ctx.user.id,
        checklist: input.checklist?.length ? { create: input.checklist.map((title, order) => ({ title, order })) } : undefined,
        dependsOn: input.dependsOn?.length ? { create: input.dependsOn.map((dependsOnId) => ({ dependsOnId })) } : undefined,
      },
    });
    await syncReminders(tx, "TASK", t.id);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "task.created", entityType: "Task", entityId: t.id, matterId: t.matterId, after: { title: t.title, assigneeId, dueAt: t.dueAt } }, tx);
    if (t.matterId) await logActivity({ organizationId: ctx.org.id, matterId: t.matterId, actorId: ctx.user.id, type: "task.created", entityType: "Task", entityId: t.id, data: { title: t.title } }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [assigneeId], excludeUserId: ctx.user.id, category: "TASK", titleKey: "notif.assignedTask", params: { title: t.title }, link: `/app/tasks?task=${t.id}` }, tx);
    return { id: t.id };
  });
}

export async function setTaskStatus(ctx: StaffContext, id: string, status: TaskStatus) {
  const t = await assertTaskAccess(ctx, id, "tasks.manage");
  if (status === "DONE") {
    const blockers = await db.taskDependency.count({ where: { taskId: id, dependsOn: { status: { notIn: ["DONE", "CANCELLED"] } } } });
    if (blockers) throw new AppError("taskBlocked", 400);
  }
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
    await syncReminders(tx, "TASK", id);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "task.status_changed", entityType: "Task", entityId: id, matterId: t.matterId, before: { status: t.status }, after: { status } }, tx);
    if (t.matterId && status === "DONE") await logActivity({ organizationId: ctx.org.id, matterId: t.matterId, actorId: ctx.user.id, type: "task.completed", entityType: "Task", entityId: id, data: { title: t.title } }, tx);
  });
}

export async function toggleTaskChecklist(ctx: StaffContext, itemId: string, done: boolean) {
  const item = await db.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound();
  await assertTaskAccess(ctx, item.taskId, "tasks.manage");
  await db.taskChecklistItem.update({ where: { id: itemId }, data: { doneAt: done ? new Date() : null } });
}

export async function addTaskChecklist(ctx: StaffContext, taskId: string, title: string) {
  await assertTaskAccess(ctx, taskId, "tasks.manage");
  const max = await db.taskChecklistItem.aggregate({ where: { taskId }, _max: { order: true } });
  await db.taskChecklistItem.create({ data: { taskId, title, order: (max._max.order ?? 0) + 1 } });
}

export async function deleteTask(ctx: StaffContext, id: string) {
  const t = await assertTaskAccess(ctx, id, "tasks.manage");
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await syncReminders(tx, "TASK", id);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "task.deleted", entityType: "Task", entityId: id, matterId: t.matterId, before: { title: t.title } }, tx);
  });
}

export async function getTaskDetail(ctx: StaffContext, id: string) {
  await assertTaskAccess(ctx, id, "tasks.view");
  return db.task.findUniqueOrThrow({
    where: { id },
    include: {
      matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } },
      assignee: { select: { id: true, name: true, nameAr: true, photoUrl: true } },
      createdBy: { select: { name: true, nameAr: true } },
      checklist: { orderBy: { order: "asc" } },
      dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, nameAr: true, photoUrl: true } } } },
    },
  });
}

export const taskListQuery = z.object({
  bucket: z.enum(["today", "overdue", "upcoming", "waiting", "assigned", "completed", "all"]).catch("all"),
  q: z.string().trim().max(100).optional().catch(undefined),
  assignee: z.string().uuid().optional().catch(undefined),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional().catch(undefined),
  matter: z.string().uuid().optional().catch(undefined),
  mine: z.coerce.boolean().catch(false),
});

export async function listTasks(ctx: StaffContext, q: z.infer<typeof taskListQuery>) {
  const now = new Date();
  const { start, end } = dayRange(now, ctx.org.timezone);
  const open: Prisma.TaskWhereInput = { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } };
  const bucket: Record<string, Prisma.TaskWhereInput> = {
    today: { ...open, dueAt: { gte: start, lt: end } },
    overdue: { ...open, dueAt: { lt: now } },
    upcoming: { ...open, dueAt: { gte: end } },
    waiting: { status: "WAITING" },
    assigned: { ...open, createdById: ctx.user.id, assigneeId: { not: ctx.user.id } },
    completed: { status: "DONE", completedAt: { gte: new Date(now.getTime() - 30 * 86400_000) } },
    all: { status: { not: "CANCELLED" } },
  };
  const where: Prisma.TaskWhereInput = {
    AND: [
      taskScopeWhere(ctx),
      bucket[q.bucket],
      q.mine && q.bucket !== "assigned" ? { assigneeId: ctx.user.id } : {},
      q.assignee ? { assigneeId: q.assignee } : {},
      q.priority ? { priority: q.priority } : {},
      q.matter ? { matterId: q.matter } : {},
      q.q ? { title: { contains: q.q } } : {},
    ],
  };
  const fetchRows = (dated: boolean) => db.task.findMany({
    where: q.bucket === "completed" ? where : { AND: [where, { dueAt: dated ? { not: null } : null }] },
    orderBy: q.bucket === "completed" ? [{ completedAt: "desc" }] : [{ dueAt: "asc" }, { priority: "asc" }],
    take: 200,
    include: {
      matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } },
      assignee: { select: { id: true, name: true, nameAr: true, photoUrl: true } },
      checklist: { select: { doneAt: true } },
      dependsOn: { where: { dependsOn: { status: { notIn: ["DONE", "CANCELLED"] } } }, select: { dependsOnId: true } },
    },
  });
  const dated = await fetchRows(true);
  const rows = q.bucket === "completed" || dated.length === 200 ? dated : [...dated, ...await fetchRows(false)].slice(0, 200);
  // Comment counts for the page only. (Prisma's `_count` include compiles on MySQL to a GROUP BY over the
  // whole Comment / checklist tables — 1.4 s at 100k tasks; this is two indexed queries instead.)
  const commentCounts = rows.length
    ? new Map((await db.comment.groupBy({ by: ["taskId"], where: { taskId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })).map((c) => [c.taskId, c._count._all]))
    : new Map<string | null, number>();
  return rows.map((t) => ({
    id: t.id, title: t.title, status: t.status, priority: t.priority, dueAt: t.dueAt?.toISOString() ?? null, completedAt: t.completedAt?.toISOString() ?? null,
    matter: t.matter, assignee: t.assignee, overdue: !!t.dueAt && t.dueAt < now && !["DONE", "CANCELLED"].includes(t.status),
    checklist: { total: t.checklist.length, done: t.checklist.filter((c) => c.doneAt).length }, comments: commentCounts.get(t.id) ?? 0, blocked: t.dependsOn.length > 0, estimateMinutes: t.estimateMinutes,
  }));
}

export async function bucketCounts(ctx: StaffContext, mine: boolean) {
  const now = new Date();
  const { start, end } = dayRange(now, ctx.org.timezone);
  const base: Prisma.TaskWhereInput = { AND: [taskScopeWhere(ctx), mine ? { assigneeId: ctx.user.id } : {}] };
  const open = { status: { in: ["TODO", "IN_PROGRESS", "WAITING"] as TaskStatus[] } };
  const [today, overdue, upcoming, waiting, assigned] = await Promise.all([
    db.task.count({ where: { ...base, ...open, dueAt: { gte: start, lt: end } } }),
    db.task.count({ where: { ...base, ...open, dueAt: { lt: now } } }),
    db.task.count({ where: { ...base, ...open, dueAt: { gte: end } } }),
    db.task.count({ where: { ...base, status: "WAITING" } }),
    db.task.count({ where: { AND: [taskScopeWhere(ctx), { ...open, createdById: ctx.user.id, assigneeId: { not: ctx.user.id } }] } }),
  ]);
  return { today, overdue, upcoming, waiting, assigned };
}

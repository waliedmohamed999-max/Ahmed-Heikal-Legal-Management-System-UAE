import { z } from "zod";
import type { NotificationCategory, Prisma } from "@prisma/client";
import { staffRoute } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { addDaysZoned, dayRange } from "@/lib/time";

const CATS = ["CRITICAL", "DEADLINE", "HEARING", "TASK", "DOCUMENT", "CLIENT", "FINANCE", "SYSTEM"];

export const GET = staffRoute(async (req, ctx) => {
  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const visible: Prisma.NotificationWhereInput = { userId: ctx.user.id, OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }] };
  if (sp.get("count")) return { unread: await db.notification.count({ where: { ...visible, readAt: null } }) };
  const cat = sp.get("category");
  const items = await db.notification.findMany({
    where: { ...visible, ...(cat && CATS.includes(cat) ? { category: cat as NotificationCategory } : {}), ...(sp.get("unread") === "1" ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, category: true, title: true, body: true, link: true, readAt: true, requiresAck: true, acknowledgedAt: true, createdAt: true },
  });
  return { items };
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("readAll") }),
  z.object({ action: z.enum(["read", "unread", "ack"]), id: z.string().uuid() }),
  z.object({ action: z.literal("snooze"), id: z.string().uuid(), hours: z.number().int().min(1).max(72).optional(), tomorrow: z.boolean().optional() }),
]);

export const POST = staffRoute(async (req, ctx) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new AppError("validation", 400);
  const b = parsed.data;
  const now = new Date();
  if (b.action === "readAll") {
    await db.notification.updateMany({ where: { userId: ctx.user.id, readAt: null }, data: { readAt: now } });
    return { ok: true };
  }
  // Ownership enforced in the where clause: users can only touch their own notifications.
  const own = { id: b.id, userId: ctx.user.id };
  const n = await db.notification.findFirst({ where: own });
  if (!n) throw new AppError("notFound", 404);
  if (b.action === "read") await db.notification.update({ where: { id: n.id }, data: { readAt: now } });
  if (b.action === "unread") await db.notification.update({ where: { id: n.id }, data: { readAt: null } });
  if (b.action === "snooze") {
    const until = b.tomorrow ? new Date(dayRange(addDaysZoned(now, 1, ctx.org.timezone), ctx.org.timezone).start.getTime() + 8 * 3600_000) : new Date(now.getTime() + (b.hours ?? 1) * 3600_000);
    await db.notification.update({ where: { id: n.id }, data: { snoozedUntil: until, readAt: now } });
  }
  if (b.action === "ack") {
    await db.notification.update({ where: { id: n.id }, data: { acknowledgedAt: now, readAt: now } });
    // Acknowledging a hearing/deadline reminder stops escalation to the owner.
    if (n.entityType === "HEARING" && n.entityId) await db.hearing.updateMany({ where: { id: n.entityId, organizationId: ctx.org.id }, data: { acknowledgedAt: now } });
    if (n.entityType === "DEADLINE" && n.entityId) await db.deadline.updateMany({ where: { id: n.entityId, organizationId: ctx.org.id }, data: { acknowledgedAt: now } });
  }
  return { ok: true };
});

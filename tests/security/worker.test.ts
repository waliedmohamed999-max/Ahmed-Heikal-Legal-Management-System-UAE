/**
 * Durable, idempotent background jobs (MySQL-backed queue): reminders and deliveries.
 * "Worker restart" is simulated exactly as it happens in production: a job is claimed
 * (PROCESSING + lease) and the process dies before finishing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createHearing } from "@/server/services/events";
import { dispatchDueReminders, dispatchPendingDeliveries, MAX_ATTEMPTS } from "@/server/services/reminders";
import { notify } from "@/server/services/notifications";
import { hearingSchema } from "@/lib/schemas";
import { toZonedLocalInput } from "@/lib/time";
import { ctxFor } from "./helpers";
import type { StaffContext } from "@/server/auth/session";

let owner: StaffContext;
let reminderIds: string[] = [];
const MIN = 60_000;

beforeAll(async () => {
  owner = await ctxFor("ahmed@demo.ahlegal.test");
  const matter = await db.matter.findFirstOrThrow({ where: { organizationId: owner.org.id, deletedAt: null, status: "ACTIVE" } });
  const startsAt = new Date(Date.now() + 5 * 24 * 3600_000);
  const h = await createHearing(owner, hearingSchema.parse({ matterId: matter.id, startsAt: toZonedLocalInput(startsAt, owner.org.timezone), sessionType: "Worker durability test", attendingLawyerId: owner.user.id }));
  const rows = await db.reminder.findMany({ where: { subjectType: "HEARING", subjectId: h.id, status: "PENDING" }, select: { id: true } });
  reminderIds = rows.map((r) => r.id);
  // Make the reminders due now.
  await db.reminder.updateMany({ where: { id: { in: reminderIds } }, data: { fireAt: new Date(Date.now() - MIN) } });
});
afterAll(async () => {
  await db.$disconnect();
});

const notificationsFor = (id: string) => db.notification.count({ where: { dedupeKey: `reminder:${id}` } });

describe("reminders survive a worker crash (lease)", () => {
  it("a job claimed by a worker that died is not touched until the lease expires, then delivered once", async () => {
    expect(reminderIds.length).toBeGreaterThan(0);
    const id = reminderIds[0];
    const now = new Date();
    // Worker A claims, then the process dies (no completion).
    await db.reminder.update({ where: { id }, data: { status: "PROCESSING", lockedUntil: new Date(now.getTime() + 2 * MIN), attempts: 1, lastAttemptAt: now } });
    await dispatchDueReminders(now);
    expect(await notificationsFor(id)).toBe(0); // still leased — nobody double-processes it
    // After restart, once the lease has expired, another tick picks it up.
    await dispatchDueReminders(new Date(now.getTime() + 3 * MIN));
    expect(await notificationsFor(id)).toBe(1);
    const r = await db.reminder.findUniqueOrThrow({ where: { id } });
    expect(r.status).toBe("SENT");
    expect(r.attempts).toBe(2);
  });
});

describe("reminder idempotency (unique delivery key)", () => {
  it("retry after 'sent but not acknowledged' does not notify the user twice", async () => {
    const id = reminderIds[1] ?? reminderIds[0];
    const r = await db.reminder.findUniqueOrThrow({ where: { id } });
    // Simulate: a previous attempt created the notification but crashed before marking SENT.
    await db.notification.upsert({
      where: { userId_dedupeKey: { userId: r.userId, dedupeKey: `reminder:${id}` } },
      create: { organizationId: r.organizationId, userId: r.userId, category: "HEARING", title: "earlier attempt", dedupeKey: `reminder:${id}` },
      update: {},
    });
    await db.reminder.update({ where: { id }, data: { status: "PENDING", lockedUntil: null } });
    await dispatchDueReminders(new Date(Date.now() + 10 * MIN));
    expect(await notificationsFor(id)).toBe(1);
    expect((await db.reminder.findUniqueOrThrow({ where: { id } })).status).toBe("SENT");
  });

  it("concurrent workers never double-send", async () => {
    await db.reminder.updateMany({ where: { id: { in: reminderIds } }, data: { status: "PENDING", lockedUntil: null } });
    const at = new Date(Date.now() + 20 * MIN);
    await Promise.all([dispatchDueReminders(at), dispatchDueReminders(at), dispatchDueReminders(at)]);
    for (const id of reminderIds) expect(await notificationsFor(id)).toBe(1);
  });
});

describe("retries with backoff", () => {
  it("a failing job is retried with backoff and marked FAILED after the attempt limit", async () => {
    const id = reminderIds[0];
    // Corrupt the job payload so every attempt throws.
    await db.reminder.update({ where: { id }, data: { status: "PENDING", lockedUntil: null, attempts: 0, channels: "not-a-list" } });
    await db.notification.deleteMany({ where: { dedupeKey: `reminder:${id}` } });
    let t = Date.now() + 30 * MIN;
    await dispatchDueReminders(new Date(t));
    let r = await db.reminder.findUniqueOrThrow({ where: { id } });
    expect(r.status).toBe("PENDING");
    expect(r.attempts).toBe(1);
    expect(r.lockedUntil!.getTime()).toBeGreaterThan(t); // backoff: not retried immediately
    await dispatchDueReminders(new Date(t + 1000));
    expect((await db.reminder.findUniqueOrThrow({ where: { id } })).attempts).toBe(1);
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      t += 3 * 3600_000;
      await dispatchDueReminders(new Date(t));
    }
    r = await db.reminder.findUniqueOrThrow({ where: { id } });
    expect(r.status).toBe("FAILED");
    expect(r.attempts).toBe(MAX_ATTEMPTS); // MAX_ATTEMPTS is the total number of attempts
    expect(r.error).toBeTruthy();
  });
});

describe("delivery queue (real SMTP → Mailpit)", () => {
  it("queues an e-mail inside the transaction and the worker sends it once", async () => {
    const subjectTag = `Delivery test ${Date.now()}`;
    await db.$transaction((tx) =>
      notify({ organizationId: owner.org.id, userIds: [owner.user.id], category: "SYSTEM", titleKey: "notif.escalation", params: {}, dedupeKey: subjectTag, channels: ["IN_APP", "EMAIL"] }, tx),
    );
    const n = await db.notification.findFirstOrThrow({ where: { userId: owner.user.id, dedupeKey: subjectTag }, include: { deliveries: true } });
    const email = n.deliveries.find((d) => d.channel === "EMAIL")!;
    expect(email.status).toBe("PENDING");
    expect(email.deliveryKey).toBe(`${n.id}:EMAIL`);
    // A second delivery row for the same notification+channel is impossible.
    await expect(db.notificationDelivery.create({ data: { notificationId: n.id, channel: "EMAIL", status: "PENDING", deliveryKey: `${n.id}:EMAIL` } })).rejects.toThrow();

    await Promise.all([dispatchPendingDeliveries(), dispatchPendingDeliveries()]);
    const d = await db.notificationDelivery.findUniqueOrThrow({ where: { id: email.id } });
    expect(d.status).toBe("SENT");
    expect(d.attempts).toBe(1);
    expect(d.provider).toBe("smtp");

    const res = await fetch("http://127.0.0.1:8025/api/v1/messages?limit=50");
    const box = (await res.json()) as { messages: { Subject: string; To: { Address: string }[] }[] };
    const got = box.messages.filter((m) => m.Subject === n.title && m.To.some((t) => t.Address === owner.user.email));
    expect(got.length).toBeGreaterThanOrEqual(1);
  });

  it("channels without a configured provider are recorded honestly as SKIPPED_NOT_CONNECTED", async () => {
    const tag = `sms-${Date.now()}`;
    await notify({ organizationId: owner.org.id, userIds: [owner.user.id], category: "SYSTEM", titleKey: "notif.escalation", params: {}, dedupeKey: tag, channels: ["SMS"] });
    await dispatchPendingDeliveries();
    const n = await db.notification.findFirstOrThrow({ where: { dedupeKey: tag }, include: { deliveries: true } });
    expect(n.deliveries[0].status).toBe("SKIPPED_NOT_CONNECTED");
  });
});

import "server-only";
import type { NotificationCategory } from "@prisma/client";
import { db, type Tx } from "../db";
import { DICTS } from "@/i18n/server";
import { makeT, type Params } from "@/i18n/translate";
import { isLocale } from "@/i18n/config";
import { deliver, type Channel } from "./channels";

export type NotifyInput = {
  organizationId: string;
  userIds: (string | null | undefined)[];
  category: NotificationCategory;
  /** i18n key rendered in each recipient's language, e.g. "notif.hearingReminder" */
  titleKey: string;
  bodyKey?: string;
  params?: Params;
  link?: string;
  entityType?: string;
  entityId?: string;
  /** Idempotency: the same key never notifies the same user twice. */
  dedupeKey?: string;
  requiresAck?: boolean;
  channels?: Channel[];
  excludeUserId?: string | null;
};

/** Create localized in-app notifications and attempt extra channels. Returns created ids. */
export async function notify(input: NotifyInput, tx: Tx = db) {
  const ids = [...new Set(input.userIds.filter((x): x is string => !!x && x !== input.excludeUserId))];
  if (!ids.length) return [];
  const users = await tx.user.findMany({
    where: { id: { in: ids }, status: "ACTIVE", deletedAt: null },
    select: { id: true, locale: true, email: true, phone: true, preferences: true },
  });
  const created: string[] = [];
  for (const u of users) {
    const t = makeT(DICTS[isLocale(u.locale) ? u.locale : "ar"]);
    const title = t(input.titleKey, input.params);
    const body = input.bodyKey ? t(input.bodyKey, input.params) : null;
    if (input.dedupeKey) {
      const exists = await tx.notification.findUnique({ where: { userId_dedupeKey: { userId: u.id, dedupeKey: input.dedupeKey } }, select: { id: true } });
      if (exists) continue;
    }
    const n = await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: u.id,
        category: input.category,
        title,
        body,
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        requiresAck: input.requiresAck ?? false,
      },
    });
    created.push(n.id);
    const prefs = (u.preferences ?? {}) as { channels?: Channel[] };
    const channels = (input.channels ?? ["IN_APP"]).filter((c) => c === "IN_APP" || !prefs.channels || prefs.channels.includes(c));
    for (const ch of channels) {
      const res = await deliver(ch, { to: { email: u.email, phone: u.phone }, subject: title, body: body ?? title, link: input.link });
      await tx.notificationDelivery.create({ data: { notificationId: n.id, channel: ch, status: res.status, error: res.error ?? null } });
    }
  }
  return created;
}

/** Parse "@Name" mentions against the team list and return user ids. */
export async function resolveMentions(organizationId: string, body: string) {
  const handles = [...body.matchAll(/@([\p{L}][\p{L}.\-]*)/gu)].map((m) => m[1].toLowerCase());
  if (!handles.length) return [];
  const users = await db.user.findMany({ where: { organizationId, kind: "STAFF", status: "ACTIVE" }, select: { id: true, name: true, nameAr: true } });
  return users
    .filter((u) => {
      const first = u.name.split(" ")[0].toLowerCase();
      const firstAr = u.nameAr?.split(" ")[0];
      return handles.includes(first) || (firstAr && handles.includes(firstAr.toLowerCase()));
    })
    .map((u) => u.id);
}

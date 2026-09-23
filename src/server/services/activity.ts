import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";

export type ActivityInput = {
  organizationId: string;
  matterId?: string | null;
  actorId?: string | null;
  type: string; // e.g. hearing.rescheduled
  entityType: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
};

/** Operational feed entry + bump the matter's lastActivityAt (drives "no recent activity" health flags). */
export async function logActivity(input: ActivityInput, tx: Tx = db) {
  await tx.activity.create({
    data: {
      organizationId: input.organizationId,
      matterId: input.matterId ?? null,
      actorId: input.actorId ?? null,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
    },
  });
  if (input.matterId) {
    await tx.matter.update({ where: { id: input.matterId }, data: { lastActivityAt: new Date() } });
  }
}

/** Record a system milestone on the curated case timeline. */
export async function timelineEvent(
  tx: Tx,
  e: { matterId: string; eventType: string; title: string; occurredAt?: Date; description?: string | null; userId?: string | null; documentIds?: string[] },
) {
  await tx.timelineEvent.create({
    data: {
      matterId: e.matterId,
      eventType: e.eventType,
      title: e.title,
      description: e.description ?? null,
      occurredAt: e.occurredAt ?? new Date(),
      userId: e.userId ?? null,
      documentIds: e.documentIds ?? [],
      source: "SYSTEM",
    },
  });
}

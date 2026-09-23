"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { staffAction } from "@/server/action";
import { db } from "@/server/db";

const WIDGET_KEYS = ["nextHearing", "critical", "agenda", "tasks", "activity", "approvals", "portfolio", "workload", "finance"] as const;

/** Per-user dashboard widget visibility (server-side preference, not browser storage). */
export const saveDashboardWidgets = staffAction(z.object({ hidden: z.array(z.enum(WIDGET_KEYS)).max(20) }), async ({ hidden }, ctx) => {
  const prefs = { ...(ctx.user.preferences ?? {}), hiddenWidgets: hidden } as Prisma.InputJsonValue;
  await db.user.update({ where: { id: ctx.user.id }, data: { preferences: prefs } });
  revalidatePath("/app");
  return { hidden };
});

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { setMatterStatus } from "@/server/services/matters";

/** Status change reuses the full update path (permissions, audit, automations, reminders). */
export const setCaseStatusAction = staffAction(z.object({ id: z.string().uuid(), status: z.enum(["ACTIVE", "CLOSED", "ARCHIVED", "PENDING", "ON_HOLD"]) }), async ({ id, status }, ctx) => {
  await setMatterStatus(ctx, id, status);
  revalidatePath(`/app/cases/${id}`, "layout");
  return { ok: true };
});

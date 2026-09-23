"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { decideApproval } from "@/server/services/approvals";

export const decideApprovalAction = staffAction(
  z.object({ id: z.string().uuid(), decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]), comment: z.string().max(2000).optional().nullable(), dueAt: z.string().optional().nullable() }),
  async ({ id, decision, comment, dueAt }, ctx) => {
    await decideApproval(ctx, id, decision, comment ?? null, dueAt);
    revalidatePath("/app", "layout");
    return { ok: true };
  },
);

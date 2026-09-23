"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { aiRequestSchema, applyAiResult, runAiTask, setAiReview } from "@/server/services/ai/assistant";

export const runAiAction = staffAction(aiRequestSchema, async (input, ctx) => {
  const r = await runAiTask(ctx, input);
  revalidatePath("/app/ai");
  return r;
});

export const applyAiAction = staffAction(z.object({ jobId: z.string().uuid(), kind: z.enum(["timeline", "tasks", "deadlines"]), indexes: z.array(z.number().int().min(0)).max(200) }), async ({ jobId, kind, indexes }, ctx) => {
  const r = await applyAiResult(ctx, jobId, kind, indexes);
  revalidatePath("/app", "layout");
  return r;
});

export const reviewAiAction = staffAction(z.object({ jobId: z.string().uuid(), status: z.enum(["ACCEPTED", "DISCARDED"]) }), async ({ jobId, status }, ctx) => {
  await setAiReview(ctx, jobId, status);
  revalidatePath("/app/ai");
  return { ok: true };
});

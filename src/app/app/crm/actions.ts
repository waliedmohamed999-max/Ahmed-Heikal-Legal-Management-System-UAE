"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { convertLead, deleteLead, moveLead, saveLead, savePipelineStages } from "@/server/services/crm";
import { leadSchema } from "@/lib/crm-schemas";

const refresh = () => revalidatePath("/app/crm");

export const saveLeadAction = staffAction(leadSchema, async (i, ctx) => { const r = await saveLead(ctx, i); refresh(); return r; });
export const moveLeadAction = staffAction(z.object({ id: z.string().uuid(), stageId: z.string().uuid(), lostReason: z.string().max(500).optional().nullable() }), async ({ id, stageId, lostReason }, ctx) => { await moveLead(ctx, id, stageId, lostReason); refresh(); return { ok: true }; });
export const convertLeadAction = staffAction(z.object({ id: z.string().uuid(), type: z.enum(["INDIVIDUAL", "COMPANY"]) }), async ({ id, type }, ctx) => { const r = await convertLead(ctx, id, type); refresh(); return r; });
export const deleteLeadAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => { await deleteLead(ctx, id); refresh(); return { ok: true }; });
export const saveStagesAction = staffAction(z.object({ stages: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80), nameAr: z.string().max(80).optional(), kind: z.enum(["OPEN", "WON", "LOST"]) })).min(2).max(15) }), async ({ stages }, ctx) => { await savePipelineStages(ctx, stages); refresh(); return { ok: true }; });

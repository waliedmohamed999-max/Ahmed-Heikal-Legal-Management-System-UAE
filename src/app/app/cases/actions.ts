"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { staffAction } from "@/server/action";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import {
  addChecklistItem, addParty, addTimelineEvent, conflictCheck, createMatter, decideAccess, decideTimelineEvent, removeMember, removeParty,
  requestAccess, toggleChecklistItem, updateMatter, upsertMember, memberSchema, accessDecisionSchema,
} from "@/server/services/matters";
import { conflictQuerySchema, intakeSchema, matterUpdateSchema, timelineSchema, PARTY_ROLES } from "@/lib/schemas";

// ── List preferences ─────────────────────────────────────────
export const saveCaseColumns = staffAction(z.object({ columns: z.array(z.string().max(30)).max(20) }), async ({ columns }, ctx) => {
  await db.user.update({ where: { id: ctx.user.id }, data: { preferences: { ...(ctx.user.preferences ?? {}), caseColumns: columns } as Prisma.InputJsonValue } });
  revalidatePath("/app/cases");
  return { columns };
});

export const saveCaseView = staffAction(z.object({ name: z.string().trim().min(1).max(60), filters: z.record(z.string(), z.string().max(200)) }), async ({ name, filters }, ctx) => {
  const v = await db.savedView.create({ data: { organizationId: ctx.org.id, userId: ctx.user.id, module: "cases", name, filters } });
  revalidatePath("/app/cases");
  return { id: v.id };
});

export const deleteCaseView = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => {
  const r = await db.savedView.deleteMany({ where: { id, userId: ctx.user.id } });
  if (!r.count) throw notFound();
  revalidatePath("/app/cases");
  return { id };
});

// ── Intake ───────────────────────────────────────────────────
export const runConflictCheck = staffAction(conflictQuerySchema, async ({ names }, ctx) => conflictCheck(ctx, names));
export const createCaseAction = staffAction(intakeSchema, async (input, ctx) => createMatter(ctx, input));

// ── Workspace ────────────────────────────────────────────────
export const updateCaseAction = staffAction(matterUpdateSchema, async (input, ctx) => {
  const r = await updateMatter(ctx, input);
  revalidatePath(`/app/cases/${input.id}`, "layout");
  return r;
});

export const upsertMemberAction = staffAction(memberSchema, async (input, ctx) => {
  await upsertMember(ctx, input);
  revalidatePath(`/app/cases/${input.matterId}`, "layout");
  return { ok: true };
});

export const removeMemberAction = staffAction(z.object({ matterId: z.string().uuid(), userId: z.string().uuid() }), async ({ matterId, userId }, ctx) => {
  await removeMember(ctx, matterId, userId);
  revalidatePath(`/app/cases/${matterId}`, "layout");
  return { ok: true };
});

export const requestAccessAction = staffAction(z.object({ matterId: z.string().uuid(), reason: z.string().max(1000).optional().nullable() }), async ({ matterId, reason }, ctx) =>
  requestAccess(ctx, matterId, reason ?? null),
);

export const decideAccessAction = staffAction(accessDecisionSchema, async (input, ctx) => {
  const r = await decideAccess(ctx, input);
  revalidatePath("/app/approvals");
  return r;
});

export const addPartyAction = staffAction(
  z.object({ matterId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), nameEn: z.string().max(200).optional().nullable(), nameAr: z.string().max(200).optional().nullable(), type: z.enum(["INDIVIDUAL", "COMPANY"]), role: z.enum(PARTY_ROLES) }),
  async ({ matterId, ...p }, ctx) => {
    await addParty(ctx, matterId, p);
    revalidatePath(`/app/cases/${matterId}`);
    return { ok: true };
  },
);

export const removePartyAction = staffAction(z.object({ id: z.string().uuid(), matterId: z.string().uuid() }), async ({ id, matterId }, ctx) => {
  await removeParty(ctx, id);
  revalidatePath(`/app/cases/${matterId}`);
  return { ok: true };
});

export const toggleChecklistAction = staffAction(z.object({ id: z.string().uuid(), done: z.boolean(), matterId: z.string().uuid() }), async ({ id, done, matterId }, ctx) => {
  await toggleChecklistItem(ctx, id, done);
  revalidatePath(`/app/cases/${matterId}`);
  return { ok: true };
});

export const addChecklistAction = staffAction(z.object({ matterId: z.string().uuid(), title: z.string().trim().min(1).max(250) }), async ({ matterId, title }, ctx) => {
  await addChecklistItem(ctx, matterId, title);
  revalidatePath(`/app/cases/${matterId}`);
  return { ok: true };
});

export const addTimelineAction = staffAction(timelineSchema, async (input, ctx) => {
  await addTimelineEvent(ctx, input);
  revalidatePath(`/app/cases/${input.matterId}/timeline`);
  return { ok: true };
});

export const decideTimelineAction = staffAction(
  z.object({ id: z.string().uuid(), matterId: z.string().uuid(), decision: z.enum(["CONFIRMED", "REJECTED"]), title: z.string().max(250).optional(), occurredAt: z.string().optional() }),
  async ({ id, matterId, decision, title, occurredAt }, ctx) => {
    await decideTimelineEvent(ctx, id, decision, { title, occurredAt });
    revalidatePath(`/app/cases/${matterId}/timeline`);
    return { ok: true };
  },
);

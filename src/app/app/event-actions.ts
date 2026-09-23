"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import {
  acknowledgeHearing, createHearing, saveHearingPrep, moveAgendaItem, saveAppointment, saveDeadline, setAppointmentStatus, setDeadlineStatus, submitHearingReport, updateHearing, verifyDeadline,
} from "@/server/services/events";
import { addTaskChecklist, deleteTask, saveTask, setTaskStatus, toggleTaskChecklist } from "@/server/services/tasks";
import { appointmentSchema, deadlineSchema, hearingReportSchema, hearingSchema, taskSchema } from "@/lib/schemas";

// Every change to an event re-renders every view that shows it (the linked core).
function refresh(matterId?: string | null) {
  revalidatePath("/app", "layout");
  if (matterId) revalidatePath(`/app/cases/${matterId}`, "layout");
}

export const saveHearingAction = staffAction(hearingSchema, async (input, ctx) => {
  const r = input.id ? await updateHearing(ctx, { ...input, id: input.id }) : await createHearing(ctx, input);
  refresh(input.matterId);
  return r;
});

export const hearingReportAction = staffAction(hearingReportSchema, async (input, ctx) => {
  const r = await submitHearingReport(ctx, input);
  refresh();
  return r;
});

export const hearingPrepAction = staffAction(
  z.object({ id: z.string().uuid(), questions: z.string().max(20000).optional().nullable(), arguments: z.string().max(20000).optional().nullable(), preparationNotes: z.string().max(20000).optional().nullable(), status: z.enum(["PREPARING", "READY"]).optional() }),
  async ({ id, ...p }, ctx) => {
    await saveHearingPrep(ctx, id, p);
    refresh();
    return { ok: true };
  },
);

export const acknowledgeHearingAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => {
  await acknowledgeHearing(ctx, id);
  refresh();
  return { ok: true };
});

export const saveDeadlineAction = staffAction(deadlineSchema, async (input, ctx) => {
  const r = await saveDeadline(ctx, input);
  refresh(input.matterId);
  return r;
});

export const verifyDeadlineAction = staffAction(z.object({ id: z.string().uuid(), approve: z.boolean(), dueAt: z.string().optional().nullable() }), async ({ id, approve, dueAt }, ctx) => {
  await verifyDeadline(ctx, id, approve, dueAt);
  refresh();
  return { ok: true };
});

export const deadlineStatusAction = staffAction(z.object({ id: z.string().uuid(), status: z.enum(["OPEN", "DONE", "CANCELLED"]) }), async ({ id, status }, ctx) => {
  await setDeadlineStatus(ctx, id, status);
  refresh();
  return { ok: true };
});

export const saveAppointmentAction = staffAction(appointmentSchema, async (input, ctx) => {
  const r = await saveAppointment(ctx, input);
  refresh(input.matterId);
  return r;
});

export const appointmentStatusAction = staffAction(z.object({ id: z.string().uuid(), status: z.enum(["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]) }), async ({ id, status }, ctx) => {
  await setAppointmentStatus(ctx, id, status);
  refresh();
  return { ok: true };
});

export const moveAgendaItemAction = staffAction(z.object({ kind: z.enum(["APPOINTMENT", "TASK"]), id: z.string().uuid(), start: z.string().datetime() }), async ({ kind, id, start }, ctx) => {
  await moveAgendaItem(ctx, kind, id, start);
  refresh();
  return { ok: true };
});

export const saveTaskAction = staffAction(taskSchema, async (input, ctx) => {
  const r = await saveTask(ctx, input);
  refresh(input.matterId);
  return r;
});

export const taskStatusAction = staffAction(z.object({ id: z.string().uuid(), status: z.enum(["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"]) }), async ({ id, status }, ctx) => {
  await setTaskStatus(ctx, id, status);
  refresh();
  return { ok: true };
});

export const taskChecklistAction = staffAction(z.object({ id: z.string().uuid(), done: z.boolean() }), async ({ id, done }, ctx) => {
  await toggleTaskChecklist(ctx, id, done);
  revalidatePath("/app/tasks");
  return { ok: true };
});

export const addTaskChecklistAction = staffAction(z.object({ taskId: z.string().uuid(), title: z.string().trim().min(1).max(250) }), async ({ taskId, title }, ctx) => {
  await addTaskChecklist(ctx, taskId, title);
  revalidatePath("/app/tasks");
  return { ok: true };
});

export const deleteTaskAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => {
  await deleteTask(ctx, id);
  refresh();
  return { ok: true };
});

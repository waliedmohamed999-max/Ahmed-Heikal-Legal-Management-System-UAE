"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { addComment, createNote, logCommunication, updateNote } from "@/server/services/collab";
import { commentSchema, communicationSchema, noteSchema } from "@/lib/schemas";

export const createNoteAction = staffAction(noteSchema, async (input, ctx) => {
  const r = await createNote(ctx, input);
  revalidatePath(`/app/cases/${input.matterId}`, "layout");
  return r;
});

export const updateNoteAction = staffAction(z.object({ id: z.string().uuid(), matterId: z.string().uuid(), pinned: z.boolean().optional(), delete: z.boolean().optional() }), async ({ id, matterId, ...patch }, ctx) => {
  await updateNote(ctx, id, patch);
  revalidatePath(`/app/cases/${matterId}/notes`);
  return { ok: true };
});

export const addCommentAction = staffAction(commentSchema, async (input, ctx) => {
  const r = await addComment(ctx, input);
  if (input.matterId) revalidatePath(`/app/cases/${input.matterId}/notes`);
  if (input.documentId) revalidatePath(`/app/documents/${input.documentId}`);
  return r;
});

export const logCommunicationAction = staffAction(communicationSchema, async (input, ctx) => {
  const r = await logCommunication(ctx, input);
  if (input.matterId) revalidatePath(`/app/cases/${input.matterId}`, "layout");
  if (input.clientId) revalidatePath(`/app/clients/${input.clientId}`);
  return r;
});

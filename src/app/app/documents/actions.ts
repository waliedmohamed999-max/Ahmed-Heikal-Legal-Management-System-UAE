"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { deleteDocument, docMetaSchema, transitionDocument, updateDocumentMeta } from "@/server/services/documents";

export const updateDocMetaAction = staffAction(docMetaSchema, async (input, ctx) => {
  await updateDocumentMeta(ctx, input);
  revalidatePath(`/app/documents/${input.id}`);
  return { ok: true };
});

export const transitionDocAction = staffAction(
  z.object({ id: z.string().uuid(), to: z.enum(["DRAFT", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SUBMITTED"]), comment: z.string().max(2000).optional().nullable() }),
  async ({ id, to, comment }, ctx) => {
    await transitionDocument(ctx, id, to, comment);
    revalidatePath("/app", "layout");
    return { ok: true };
  },
);

export const deleteDocAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => {
  await deleteDocument(ctx, id);
  revalidatePath("/app", "layout");
  return { ok: true };
});

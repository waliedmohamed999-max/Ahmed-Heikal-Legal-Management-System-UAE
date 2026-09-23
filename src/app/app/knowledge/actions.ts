"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { generateSchema, knowledgeSchema, templateSchema } from "@/lib/templates";
import { noteSchema } from "@/lib/schemas";
import { deleteKnowledge, deleteTemplate, generateFromTemplate, saveKnowledge, saveTemplate } from "@/server/services/knowledge";
import { createNote } from "@/server/services/collab";

const id = z.object({ id: z.string().uuid() });

export const saveKnowledgeAction = staffAction(knowledgeSchema, async (d, ctx) => {
  const r = await saveKnowledge(ctx, d);
  revalidatePath("/app/knowledge");
  return { id: r.id };
});
export const deleteKnowledgeAction = staffAction(id, async (d, ctx) => {
  await deleteKnowledge(ctx, d.id);
  revalidatePath("/app/knowledge");
  return { ok: true };
});
export const saveTemplateAction = staffAction(templateSchema, async (d, ctx) => {
  const r = await saveTemplate(ctx, d);
  revalidatePath("/app/templates");
  return { id: r.id };
});
export const deleteTemplateAction = staffAction(id, async (d, ctx) => {
  await deleteTemplate(ctx, d.id);
  revalidatePath("/app/templates");
  return { ok: true };
});
export const generateTemplateAction = staffAction(generateSchema, (d, ctx) => generateFromTemplate(ctx, d));
/** Save a generated draft on the case as an internal (team) note. */
export const saveDraftAsNoteAction = staffAction(noteSchema, async (d, ctx) => {
  const n = await createNote(ctx, { ...d, visibility: "TEAM" });
  revalidatePath(`/app/cases/${d.matterId}/notes`);
  return { id: n.id };
});

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { addContactRelation, createClient, deleteClient, revealClientSensitive, saveContact, updateClient } from "@/server/services/clients";
import { clientSchema, contactSchema } from "@/lib/schemas";

export const createClientAction = staffAction(clientSchema, async (input, ctx) => {
  const r = await createClient(ctx, input);
  revalidatePath("/app/clients");
  return r;
});

export const updateClientAction = staffAction(clientSchema.extend({ id: z.string().uuid() }), async ({ id, ...input }, ctx) => {
  const r = await updateClient(ctx, id, input);
  revalidatePath(`/app/clients/${id}`);
  return r;
});

export const deleteClientAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => {
  await deleteClient(ctx, id);
  revalidatePath("/app/clients");
  return { ok: true };
});

export const revealSensitiveAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => revealClientSensitive(ctx, id));

export const saveContactAction = staffAction(contactSchema.extend({ id: z.string().uuid().optional().or(z.literal("")) }), async ({ id, ...input }, ctx) => {
  const r = await saveContact(ctx, id || null, input);
  revalidatePath("/app/contacts");
  return r;
});

export const addRelationAction = staffAction(z.object({ fromId: z.string().uuid(), toId: z.string().uuid(), label: z.string().trim().min(1).max(80) }), async ({ fromId, toId, label }, ctx) => {
  await addContactRelation(ctx, fromId, toId, label);
  revalidatePath("/app/contacts");
  return { ok: true };
});

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { applyImportSchema } from "@/lib/court-import";
import { applyImport, discardImport } from "@/server/services/court-import";

export const applyImportAction = staffAction(applyImportSchema, async (d, ctx) => {
  const r = await applyImport(ctx, d);
  revalidatePath("/app/integrations/import");
  revalidatePath(`/app/cases/${d.matterId}`, "layout");
  return r;
});

export const discardImportAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => {
  await discardImport(ctx, id);
  revalidatePath("/app/integrations/import");
  return { ok: true };
});

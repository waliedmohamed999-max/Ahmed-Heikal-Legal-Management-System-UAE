"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { runDatabaseBackup } from "@/server/services/backup";

export const runBackupAction = staffAction(z.object({}), async (_i, ctx) => {
  const r = await runDatabaseBackup(ctx);
  revalidatePath("/app/settings/backups");
  return r;
});

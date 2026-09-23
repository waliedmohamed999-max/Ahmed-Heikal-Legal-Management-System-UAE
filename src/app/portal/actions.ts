"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/server/auth/session";
import { handleError, type ActionResult } from "@/server/action";
import { rateLimit } from "@/server/rate-limit";
import { portalSendMessage } from "@/server/services/portal";

const schema = z.object({ matterId: z.string().uuid(), body: z.string().trim().min(1).max(4000) });

export async function portalMessageAction(raw: z.input<typeof schema>): Promise<ActionResult<{ ok: true }>> {
  try {
    const ctx = await requireClient();
    if (!(await rateLimit(`portal:${ctx.user.id}`, 30, 3600)).ok) return { ok: false, error: "rateLimited" };
    const input = schema.parse(raw);
    await portalSendMessage(ctx, input.matterId, input.body);
    revalidatePath("/portal");
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return handleError(e);
  }
}

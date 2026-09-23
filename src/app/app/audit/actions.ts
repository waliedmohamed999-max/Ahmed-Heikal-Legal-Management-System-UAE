"use server";

import { z } from "zod";
import { staffAction } from "@/server/action";
import { verifyAuditChain } from "@/server/audit";
import { assertPermission } from "@/server/services/access";

export const verifyAuditAction = staffAction(z.object({}), async (_i, ctx) => {
  assertPermission(ctx, "audit.view");
  return verifyAuditChain(ctx.org.id);
});

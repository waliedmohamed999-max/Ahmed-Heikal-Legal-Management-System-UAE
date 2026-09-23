"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { staffAction } from "@/server/action";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/services/access";
import {
  changeOwnPassword, deleteRole, officeSchema, revokeSession, roleSchema, saveOffice, saveReference, saveReminderSettings, saveRole, saveUser, thresholdsSchema, toggleAutomation, userSchema,
} from "@/server/services/admin";
import { beginMfaEnrolment, confirmMfaEnrolment } from "@/server/auth/login";

const done = (p = "/app/settings") => revalidatePath(p, "layout");

export const saveUserAction = staffAction(userSchema, async (i, ctx) => { const r = await saveUser(ctx, i); done(); return r; });
export const saveRoleAction = staffAction(roleSchema, async (i, ctx) => { const r = await saveRole(ctx, i); done(); return r; });
export const deleteRoleAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => { await deleteRole(ctx, id); done(); return { ok: true }; });
export const saveOfficeAction = staffAction(officeSchema, async (i, ctx) => { await saveOffice(ctx, i); done("/app"); return { ok: true }; });
export const saveRemindersAction = staffAction(thresholdsSchema, async (i, ctx) => { const r = await saveReminderSettings(ctx, i); done("/app"); return r; });
export const saveReferenceAction = staffAction(z.object({ kind: z.enum(["jurisdiction", "court", "caseType", "checklist", "workflow"]), data: z.unknown() }), async ({ kind, data }, ctx) => {
  const r = await saveReference(ctx, kind, data);
  done();
  return r;
});
export const toggleAutomationAction = staffAction(z.object({ id: z.string().uuid(), enabled: z.boolean() }), async ({ id, enabled }, ctx) => { await toggleAutomation(ctx, id, enabled); done(); return { ok: true }; });
export const revokeSessionAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => { await revokeSession(ctx, id); done(); return { ok: true }; });
export const changePasswordAction = staffAction(z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }), async ({ current, next }, ctx) => { await changeOwnPassword(ctx, current, next); return { ok: true }; });
export const beginMfaAction = staffAction(z.object({}), async (_i, ctx) => {
  const r = await beginMfaEnrolment(ctx.user.id, ctx.user.email);
  return { secret: r.secret, uri: r.uri };
});
export const confirmMfaAction = staffAction(z.object({ code: z.string().regex(/^\d{6}$/, "invalid") }), async ({ code }, ctx) => {
  const ok = await confirmMfaEnrolment(ctx.user.id, code);
  if (!ok) return { ok: false };
  // Mark the current session as verified so the user is not locked out immediately.
  await db.session.update({ where: { id: ctx.sessionId }, data: { mfaVerified: true } });
  done();
  return { ok: true };
});

export const saveAiSettingsAction = staffAction(z.object({ enabled: z.boolean(), allowDocumentProcessing: z.boolean() }), async (i, ctx) => {
  assertPermission(ctx, "settings.manage");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.org.id } });
  const before = (org.settings as { ai?: unknown }).ai;
  await db.organization.update({ where: { id: ctx.org.id }, data: { settings: { ...(org.settings as object), ai: i } as Prisma.InputJsonValue } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "settings.ai_changed", entityType: "Organization", entityId: ctx.org.id, before, after: i });
  done("/app");
  return { ok: true };
});

export const saveRetentionAction = staffAction(z.object({ closedMatterYears: z.coerce.number().int().min(1).max(50) }), async (i, ctx) => {
  assertPermission(ctx, "privacy.manage");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.org.id } });
  await db.organization.update({ where: { id: ctx.org.id }, data: { settings: { ...(org.settings as object), retention: i } as Prisma.InputJsonValue } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "settings.retention_changed", entityType: "Organization", entityId: ctx.org.id, after: i });
  done();
  return { ok: true };
});

export const privacyRequestAction = staffAction(
  z.object({ id: z.string().uuid().optional(), kind: z.enum(["EXPORT", "DELETION", "RECTIFICATION"]), subjectId: z.string().uuid(), status: z.enum(["OPEN", "ON_LEGAL_HOLD", "COMPLETED", "REJECTED"]).default("OPEN"), notes: z.string().max(4000).optional() }),
  async (i, ctx) => {
    assertPermission(ctx, "privacy.manage");
    const client = await db.client.findFirst({ where: { id: i.subjectId, organizationId: ctx.org.id } });
    if (!client) return { ok: false };
    // Deletion requests on clients with retained case records go on legal hold, never silent deletion.
    const retained = i.kind === "DELETION" ? await db.matter.count({ where: { clientId: client.id } }) : 0;
    const status = i.kind === "DELETION" && retained > 0 && i.status === "COMPLETED" ? "ON_LEGAL_HOLD" : i.status;
    const r = i.id
      ? await db.privacyRequest.update({ where: { id: i.id, organizationId: ctx.org.id }, data: { status, notes: i.notes, completedAt: status === "COMPLETED" ? new Date() : null } })
      : await db.privacyRequest.create({ data: { organizationId: ctx.org.id, kind: i.kind, subjectType: "CLIENT", subjectId: client.id, status, notes: i.notes, requestedById: ctx.user.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "privacy.request_saved", entityType: "PrivacyRequest", entityId: r.id, after: { kind: i.kind, status } });
    done();
    return { ok: true, status };
  },
);

export const breachAction = staffAction(
  z.object({ detectedAt: z.string().min(1), description: z.string().trim().min(1).max(4000), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), affectedData: z.string().max(2000).optional(), actionsTaken: z.string().max(4000).optional(), reportedToAuthorityAt: z.string().optional() }),
  async (i, ctx) => {
    assertPermission(ctx, "privacy.manage");
    const b = await db.breachLog.create({
      data: { organizationId: ctx.org.id, detectedAt: new Date(i.detectedAt), description: i.description, severity: i.severity, affectedData: i.affectedData, actionsTaken: i.actionsTaken, reportedToAuthorityAt: i.reportedToAuthorityAt ? new Date(i.reportedToAuthorityAt) : null, recordedById: ctx.user.id },
    });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "privacy.breach_recorded", entityType: "BreachLog", entityId: b.id, after: { severity: i.severity } });
    done();
    return { ok: true };
  },
);

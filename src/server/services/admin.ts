import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit, diff } from "../audit";
import { assertPermission } from "./access";
import { hashPassword, passwordPolicyError, verifyPassword } from "../auth/password";
import { ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { DEFAULT_THRESHOLDS } from "@/lib/deadline";
import { caseTypeSchema, checklistSchema, courtSchema, jurisdictionSchema, officeSchema, roleSchema, thresholdsSchema, userSchema, workflowSchema } from "@/lib/admin-schemas";

export { caseTypeSchema, checklistSchema, courtSchema, jurisdictionSchema, officeSchema, roleSchema, thresholdsSchema, userSchema, workflowSchema };

// ─────────────────────────── Users ───────────────────────────
async function ownerGuard(tx: Prisma.TransactionClient, orgId: string, userId: string, next: { roleId?: string; status?: string }) {
  const owner = await tx.role.findFirst({ where: { organizationId: orgId, key: "owner" }, select: { id: true } });
  if (!owner) return;
  const u = await tx.user.findUnique({ where: { id: userId }, select: { roleId: true, status: true } });
  if (u?.roleId !== owner.id) return;
  const losing = (next.roleId && next.roleId !== owner.id) || (next.status && next.status !== "ACTIVE");
  if (!losing) return;
  const others = await tx.user.count({ where: { organizationId: orgId, roleId: owner.id, status: "ACTIVE", deletedAt: null, id: { not: userId } } });
  if (others === 0) throw new AppError("lastOwner", 400);
}

export async function saveUser(ctx: StaffContext, input: z.output<typeof userSchema>) {
  assertPermission(ctx, "team.manage");
  const role = await db.role.findFirst({ where: { id: input.roleId, organizationId: ctx.org.id } });
  if (!role || role.key === "client") throw new AppError("validation", 400, { roleId: "invalid" });
  if (role.key === "owner" && !ctx.can("roles.manage")) throw forbidden();
  if (input.password) {
    const pe = passwordPolicyError(input.password);
    if (pe) throw new AppError(pe, 400, { password: pe });
  }
  const data = {
    email: input.email, name: input.name, nameAr: input.nameAr || null, position: input.position || null, positionAr: input.positionAr || null,
    phone: input.phone || null, roleId: input.roleId, status: input.status,
  };
  return db.$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.user.findFirst({ where: { id: input.id, organizationId: ctx.org.id, kind: "STAFF", deletedAt: null } });
      if (!before) throw notFound();
      await ownerGuard(tx, ctx.org.id, before.id, data);
      const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
      await tx.user.update({ where: { id: before.id }, data: { ...data, ...(input.password ? { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date() } : {}) } });
      if (data.status !== "ACTIVE" || input.password || d.changed.includes("roleId")) {
        // Role / status / password changes end existing sessions immediately.
        await tx.session.updateMany({ where: { userId: before.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: d.changed.includes("roleId") ? "permission.changed" : "user.updated", entityType: "User", entityId: before.id, before: d.before, after: { ...d.after, ...(input.password ? { password: "[reset]" } : {}) } }, tx);
      return { id: before.id };
    }
    if (!input.password) throw new AppError("validation", 400, { password: "required" });
    const exists = await tx.user.findUnique({ where: { email: input.email } });
    if (exists) throw new AppError("conflict", 409, { email: "invalid" });
    const u = await tx.user.create({ data: { ...data, organizationId: ctx.org.id, kind: "STAFF", passwordHash: await hashPassword(input.password), locale: "ar" } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "user.created", entityType: "User", entityId: u.id, after: { email: u.email, role: role.key } }, tx);
    return { id: u.id };
  });
}

export async function listSessions(ctx: StaffContext, userId: string) {
  if (userId !== ctx.user.id) assertPermission(ctx, "team.manage");
  return db.session.findMany({ where: { userId, user: { organizationId: ctx.org.id }, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true, realm: true } });
}

export async function revokeSession(ctx: StaffContext, sessionId: string) {
  const s = await db.session.findUnique({ where: { id: sessionId }, include: { user: { select: { organizationId: true } } } });
  if (!s || s.user.organizationId !== ctx.org.id) throw notFound();
  if (s.userId !== ctx.user.id) assertPermission(ctx, "team.manage");
  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "auth.session_revoked", entityType: "Session", entityId: sessionId, metadata: { userId: s.userId } });
}

export async function changeOwnPassword(ctx: StaffContext, current: string, next: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!(await verifyPassword(u.passwordHash, current))) throw new AppError("invalidPassword", 400, { current: "invalid" });
  const pe = passwordPolicyError(next);
  if (pe) throw new AppError(pe, 400, { next: pe });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
    await tx.session.updateMany({ where: { userId: u.id, revokedAt: null, id: { not: ctx.sessionId } }, data: { revokedAt: new Date() } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "auth.password_changed", entityType: "User", entityId: u.id }, tx);
  });
}

// ─────────────────────────── Roles ───────────────────────────
/** Permissions the owner role must always keep so the office can never lock itself out. */
const OWNER_LOCKED: PermissionKey[] = ["roles.manage", "team.manage", "settings.manage", "audit.view"];

export async function saveRole(ctx: StaffContext, input: z.output<typeof roleSchema>) {
  assertPermission(ctx, "roles.manage");
  const perms = input.permissions.filter((p): p is PermissionKey => (ALL_PERMISSIONS as string[]).includes(p) && p !== "portal.access");
  return db.$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.role.findFirst({ where: { id: input.id, organizationId: ctx.org.id }, include: { permissions: true } });
      if (!before) throw notFound();
      if (before.key === "client") throw forbidden();
      const finalPerms = before.key === "owner" ? [...new Set([...perms, ...OWNER_LOCKED])] : perms;
      await tx.role.update({ where: { id: before.id }, data: { name: input.name, nameAr: input.nameAr || null, description: input.description || null, matterScope: before.key === "owner" ? "ALL" : input.matterScope } });
      await tx.rolePermission.deleteMany({ where: { roleId: before.id } });
      await tx.rolePermission.createMany({ data: finalPerms.map((permissionKey) => ({ roleId: before.id, permissionKey })) });
      const oldP = before.permissions.map((p) => p.permissionKey).sort();
      // Role permissions are loaded live on every request, so changes apply immediately.
      await audit({
        organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "permission.changed", entityType: "Role", entityId: before.id,
        before: { matterScope: before.matterScope, added: [], removed: [] },
        after: { matterScope: input.matterScope, added: finalPerms.filter((p) => !oldP.includes(p)), removed: oldP.filter((p) => !finalPerms.includes(p as PermissionKey)) },
      }, tx);
      return { id: before.id };
    }
    const key = `custom_${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${Date.now().toString(36)}`;
    const r = await tx.role.create({ data: { organizationId: ctx.org.id, key, name: input.name, nameAr: input.nameAr || null, description: input.description || null, matterScope: input.matterScope, isSystem: false, rank: 100 } });
    await tx.rolePermission.createMany({ data: perms.map((permissionKey) => ({ roleId: r.id, permissionKey })) });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "role.created", entityType: "Role", entityId: r.id, after: { name: r.name, permissions: perms, matterScope: input.matterScope } }, tx);
    return { id: r.id };
  });
}

export async function deleteRole(ctx: StaffContext, id: string) {
  assertPermission(ctx, "roles.manage");
  const r = await db.role.findFirst({ where: { id, organizationId: ctx.org.id }, include: { _count: { select: { users: true } } } });
  if (!r) throw notFound();
  if (r.isSystem || r._count.users > 0) throw new AppError("roleInUse", 400);
  await db.role.delete({ where: { id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "role.deleted", entityType: "Role", entityId: id, before: { name: r.name } });
}

// ─────────────────────────── Office & engine settings ───────────────────────────
export async function saveOffice(ctx: StaffContext, input: z.output<typeof officeSchema>) {
  assertPermission(ctx, "settings.manage");
  const before = await db.organization.findUniqueOrThrow({ where: { id: ctx.org.id } });
  const { hijri, ...rest } = input;
  const data = { ...rest, nameAr: rest.nameAr || null, trn: rest.trn || null, address: rest.address || null, phone: rest.phone || null, email: rest.email || null };
  const d = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
  await db.organization.update({ where: { id: ctx.org.id }, data: { ...data, settings: { ...(before.settings as object), hijri } as Prisma.InputJsonValue } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "settings.office_changed", entityType: "Organization", entityId: ctx.org.id, before: d.before, after: d.after });
}

export async function saveReminderSettings(ctx: StaffContext, input: z.output<typeof thresholdsSchema>) {
  assertPermission(ctx, "settings.manage");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.org.id } });
  const sorted = [...input.thresholds].sort((a, b) => a.minutes - b.minutes);
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: ctx.org.id }, data: { settings: { ...(org.settings as object), alertThresholds: sorted } as Prisma.InputJsonValue } });
    for (const p of input.policies) {
      await tx.reminderPolicy.upsert({
        where: { organizationId_subjectType: { organizationId: ctx.org.id, subjectType: p.subjectType } },
        update: { offsetsMinutes: [...new Set(p.offsetsMinutes)].sort((a, b) => b - a), channels: ["IN_APP", ...p.channels.filter((c) => c !== "IN_APP")], notifyOwner: p.notifyOwner, escalateBeforeMinutes: p.escalateBeforeMinutes || null, enabled: p.enabled },
        create: { organizationId: ctx.org.id, subjectType: p.subjectType, offsetsMinutes: p.offsetsMinutes, channels: p.channels, notifyOwner: p.notifyOwner, escalateBeforeMinutes: p.escalateBeforeMinutes || null, enabled: p.enabled },
      });
    }
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "settings.reminders_changed", entityType: "Organization", entityId: ctx.org.id, after: input }, tx);
  });
  // Re-materialise every future reminder under the new rules.
  const { syncReminders } = await import("./reminders");
  const now = new Date();
  const [hs, ds, as, ts] = await Promise.all([
    db.hearing.findMany({ where: { organizationId: ctx.org.id, startsAt: { gt: now }, deletedAt: null }, select: { id: true } }),
    db.deadline.findMany({ where: { organizationId: ctx.org.id, dueAt: { gt: now }, status: "OPEN", deletedAt: null }, select: { id: true } }),
    db.appointment.findMany({ where: { organizationId: ctx.org.id, startsAt: { gt: now }, deletedAt: null }, select: { id: true } }),
    db.task.findMany({ where: { organizationId: ctx.org.id, dueAt: { gt: now }, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }, select: { id: true } }),
  ]);
  for (const x of hs) await syncReminders(db, "HEARING", x.id);
  for (const x of ds) await syncReminders(db, "DEADLINE", x.id);
  for (const x of as) await syncReminders(db, "APPOINTMENT", x.id);
  for (const x of ts) await syncReminders(db, "TASK", x.id);
  return { resynced: hs.length + ds.length + as.length + ts.length };
}

export function currentThresholds(settings: Record<string, unknown>) {
  const t = settings.alertThresholds as { level: string; minutes: number }[] | null | undefined;
  return Array.isArray(t) && t.length === 5 ? t : DEFAULT_THRESHOLDS;
}

// ─────────────────────────── Reference data (jurisdiction engine) ───────────────────────────

type RefKind = "jurisdiction" | "court" | "caseType" | "checklist" | "workflow";

export async function saveReference(ctx: StaffContext, kind: RefKind, raw: unknown) {
  assertPermission(ctx, "settings.manage");
  const orgId = ctx.org.id;
  const blank = (v?: string | null) => (v ? v : null);
  let id: string;
  if (kind === "jurisdiction") {
    const i = jurisdictionSchema.parse(raw);
    const data = { code: i.code, name: i.name, nameAr: blank(i.nameAr), kind: i.kind, emirate: blank(i.emirate), active: i.active };
    id = i.id ? (await db.jurisdiction.update({ where: { id: i.id, organizationId: orgId }, data })).id : (await db.jurisdiction.create({ data: { ...data, organizationId: orgId } })).id;
  } else if (kind === "court") {
    const i = courtSchema.parse(raw);
    if (!(await db.jurisdiction.findFirst({ where: { id: i.jurisdictionId, organizationId: orgId } }))) throw notFound();
    const data = { jurisdictionId: i.jurisdictionId, name: i.name, nameAr: blank(i.nameAr), level: blank(i.level), emirate: blank(i.emirate), active: i.active };
    id = i.id ? (await db.court.update({ where: { id: i.id, organizationId: orgId }, data })).id : (await db.court.create({ data: { ...data, organizationId: orgId } })).id;
  } else if (kind === "caseType") {
    const i = caseTypeSchema.parse(raw);
    const data = { code: i.code, name: i.name, nameAr: blank(i.nameAr), categoryId: blank(i.categoryId), active: i.active };
    id = i.id ? (await db.caseType.update({ where: { id: i.id, organizationId: orgId }, data })).id : (await db.caseType.create({ data: { ...data, organizationId: orgId } })).id;
  } else if (kind === "checklist") {
    const i = checklistSchema.parse(raw);
    id = await db.$transaction(async (tx) => {
      const data = { name: i.name, nameAr: blank(i.nameAr), caseTypeId: blank(i.caseTypeId), active: i.active };
      const tpl = i.id ? await tx.checklistTemplate.update({ where: { id: i.id, organizationId: orgId }, data }) : await tx.checklistTemplate.create({ data: { ...data, organizationId: orgId } });
      await tx.checklistTemplateItem.deleteMany({ where: { templateId: tpl.id } });
      await tx.checklistTemplateItem.createMany({ data: i.items.map((it, order) => ({ templateId: tpl.id, order, title: it.title, titleAr: blank(it.titleAr), required: it.required })) });
      return tpl.id;
    });
  } else {
    const i = workflowSchema.parse(raw);
    id = await db.$transaction(async (tx) => {
      const data = { name: i.name, nameAr: blank(i.nameAr), jurisdictionId: blank(i.jurisdictionId), caseTypeId: blank(i.caseTypeId), isDefault: i.isDefault };
      if (i.isDefault) await tx.workflow.updateMany({ where: { organizationId: orgId }, data: { isDefault: false } });
      const wf = i.id ? await tx.workflow.update({ where: { id: i.id, organizationId: orgId }, data }) : await tx.workflow.create({ data: { ...data, organizationId: orgId } });
      // Keep stage ids stable for stages still in use (matters reference them).
      const existing = await tx.workflowStage.findMany({ where: { workflowId: wf.id } });
      for (const [order, s] of i.stages.entries()) {
        const ex = existing.find((e) => e.key === s.key);
        if (ex) await tx.workflowStage.update({ where: { id: ex.id }, data: { name: s.name, nameAr: blank(s.nameAr), isTerminal: s.isTerminal, order } });
        else await tx.workflowStage.create({ data: { workflowId: wf.id, key: s.key, name: s.name, nameAr: blank(s.nameAr), isTerminal: s.isTerminal, order } });
      }
      for (const ex of existing.filter((e) => !i.stages.some((s) => s.key === e.key))) {
        const used = await tx.matter.count({ where: { stageId: ex.id } });
        if (!used) await tx.workflowStage.delete({ where: { id: ex.id } });
      }
      return wf.id;
    });
  }
  await audit({ organizationId: orgId, actorId: ctx.user.id, sessionId: ctx.sessionId, action: `settings.${kind}_saved`, entityType: kind, entityId: id, after: raw });
  return { id };
}

export async function toggleAutomation(ctx: StaffContext, id: string, enabled: boolean) {
  assertPermission(ctx, "settings.manage");
  const a = await db.automation.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!a) throw notFound();
  await db.automation.update({ where: { id }, data: { enabled } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "settings.automation_toggled", entityType: "Automation", entityId: id, before: { enabled: a.enabled }, after: { enabled } });
}

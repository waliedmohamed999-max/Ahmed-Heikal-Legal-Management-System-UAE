import "server-only";
import { z } from "zod";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { assertMatter, assertOptionalMatter } from "./access";
import { logActivity } from "./activity";
import { notify, resolveMentions } from "./notifications";
import { commentSchema, communicationSchema, noteSchema } from "@/lib/schemas";
import { fromZonedLocal } from "@/lib/time";

// ─────────────────────────── Notes ───────────────────────────
/**
 * Three strictly separated channels:
 *  PRIVATE — author only (even owners cannot read others' private notes)
 *  TEAM    — case members with notes.view
 *  CLIENT  — shown in the portal; requires notes.shareClient + explicit confirmation
 */
export async function listNotes(ctx: StaffContext, matterId: string) {
  await assertMatter(ctx, matterId, "notes.view");
  const notes = await db.note.findMany({
    where: { matterId, deletedAt: null, OR: [{ visibility: { in: ["TEAM", "CLIENT"] } }, { visibility: "PRIVATE", authorId: ctx.user.id }] },
    include: { author: { select: { id: true, name: true, nameAr: true, photoUrl: true } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  return notes;
}

export async function createNote(ctx: StaffContext, input: z.output<typeof noteSchema>) {
  const acc = await assertMatter(ctx, input.matterId, "notes.create");
  if (input.visibility === "CLIENT") {
    if (!acc.has("notes.shareClient")) throw forbidden();
    if (!input.confirmClientVisible) throw new AppError("validation", 400, { confirmClientVisible: "required" });
  }
  return db.$transaction(async (tx) => {
    const n = await tx.note.create({
      data: { matterId: input.matterId, authorId: ctx.user.id, body: input.body, visibility: input.visibility, pinned: input.pinned, sharedAt: input.visibility === "CLIENT" ? new Date() : null },
    });
    if (input.visibility !== "PRIVATE") {
      await logActivity({ organizationId: ctx.org.id, matterId: input.matterId, actorId: ctx.user.id, type: "note.created", entityType: "Note", entityId: n.id }, tx);
    }
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: input.visibility === "CLIENT" ? "note.shared_with_client" : "note.created", entityType: "Note", entityId: n.id, matterId: input.matterId, metadata: { visibility: input.visibility } }, tx);
    if (input.visibility === "TEAM") {
      const mentions = await resolveMentions(ctx.org.id, input.body);
      await notify({ organizationId: ctx.org.id, userIds: mentions, excludeUserId: ctx.user.id, category: "TASK", titleKey: "notif.mentioned", params: { name: ctx.user.name }, link: `/app/cases/${input.matterId}/notes` }, tx);
    }
    return { id: n.id };
  });
}

export async function updateNote(ctx: StaffContext, id: string, patch: { pinned?: boolean; delete?: boolean }) {
  const n = await db.note.findUnique({ where: { id } });
  if (!n || n.deletedAt) throw notFound();
  if (n.visibility === "PRIVATE" && n.authorId !== ctx.user.id) throw notFound();
  const acc = await assertMatter(ctx, n.matterId, "notes.view");
  if (n.authorId !== ctx.user.id && !acc.has("matters.edit")) throw forbidden();
  await db.note.update({ where: { id }, data: { pinned: patch.pinned ?? undefined, deletedAt: patch.delete ? new Date() : undefined } });
  if (patch.delete) await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "note.deleted", entityType: "Note", entityId: id, matterId: n.matterId });
}

// ─────────────────────────── Comments & mentions ───────────────────────────
export async function listComments(ctx: StaffContext, target: { matterId?: string; documentId?: string; taskId?: string }) {
  if (target.matterId) await assertMatter(ctx, target.matterId, "matters.view");
  return db.comment.findMany({
    where: { ...target, deletedAt: null },
    include: { author: { select: { id: true, name: true, nameAr: true, photoUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function addComment(ctx: StaffContext, input: z.output<typeof commentSchema>) {
  let matterId = input.matterId;
  let link = "";
  if (input.documentId) {
    const d = await db.document.findFirst({ where: { id: input.documentId, organizationId: ctx.org.id, deletedAt: null } });
    if (!d) throw notFound();
    await assertOptionalMatter(ctx, d.matterId, "documents.view");
    matterId = d.matterId;
    link = `/app/documents/${d.id}`;
  } else if (input.taskId) {
    const tk = await db.task.findFirst({ where: { id: input.taskId, organizationId: ctx.org.id, deletedAt: null } });
    if (!tk) throw notFound();
    if (tk.matterId) await assertMatter(ctx, tk.matterId, "tasks.view");
    else if (tk.assigneeId !== ctx.user.id && tk.createdById !== ctx.user.id) throw notFound();
    matterId = tk.matterId;
    link = `/app/tasks?task=${tk.id}`;
  } else if (matterId) {
    await assertMatter(ctx, matterId, "matters.view");
    link = `/app/cases/${matterId}/notes`;
  } else throw new AppError("validation", 400);

  const mentions = await resolveMentions(ctx.org.id, input.body);
  // Only notify mentioned users who can actually see the matter
  let allowed = mentions;
  if (matterId && mentions.length) {
    const m = await db.matter.findUniqueOrThrow({ where: { id: matterId }, select: { confidentiality: true, members: { select: { userId: true, expiresAt: true } } } });
    const members = new Set(m.members.filter((x) => !x.expiresAt || x.expiresAt > new Date()).map((x) => x.userId));
    if (m.confidentiality !== "STANDARD") allowed = mentions.filter((u) => members.has(u));
  }
  return db.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { authorId: ctx.user.id, matterId: input.documentId || input.taskId ? null : matterId, documentId: input.documentId, taskId: input.taskId, body: input.body, mentions: allowed } });
    if (matterId) await logActivity({ organizationId: ctx.org.id, matterId, actorId: ctx.user.id, type: "comment.created", entityType: "Comment", entityId: c.id }, tx);
    await notify({ organizationId: ctx.org.id, userIds: allowed, excludeUserId: ctx.user.id, category: "TASK", titleKey: "notif.mentioned", params: { name: ctx.user.name }, link }, tx);
    return { id: c.id };
  });
}

// ─────────────────────────── Communications ───────────────────────────
export async function logCommunication(ctx: StaffContext, input: z.output<typeof communicationSchema>) {
  if (input.matterId) await assertMatter(ctx, input.matterId, "communications.manage");
  else if (!ctx.can("communications.manage")) throw forbidden();
  let clientId = input.clientId;
  if (input.matterId && !clientId) clientId = (await db.matter.findUniqueOrThrow({ where: { id: input.matterId }, select: { clientId: true } })).clientId;
  const occurredAt = fromZonedLocal(input.occurredAt, ctx.org.timezone);
  return db.$transaction(async (tx) => {
    const c = await tx.communication.create({
      data: { organizationId: ctx.org.id, matterId: input.matterId, clientId, channel: input.channel, direction: input.direction, subject: input.subject, body: input.body, occurredAt, userId: ctx.user.id },
    });
    if (clientId) await tx.client.update({ where: { id: clientId }, data: { lastContactAt: occurredAt } });
    if (input.matterId) await logActivity({ organizationId: ctx.org.id, matterId: input.matterId, actorId: ctx.user.id, type: "communication.logged", entityType: "Communication", entityId: c.id, data: { channel: input.channel } }, tx);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "communication.logged", entityType: "Communication", entityId: c.id, matterId: input.matterId }, tx);
    return { id: c.id };
  });
}

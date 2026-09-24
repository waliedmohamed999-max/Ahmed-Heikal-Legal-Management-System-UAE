import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { storage } from "../storage";
import { notify } from "./notifications";
import { MAX_UPLOAD_BYTES, sanitizeFileName, sniff } from "./documents";
import { initialScanStatus, isServable, scanVersion } from "./malware";

type ClientCtx = StaffContext & { user: { clientId: string } };

/**
 * Everything a client may see. Scope: their own client record → matters with the
 * portal enabled → only items explicitly shared (documents, client-visible notes,
 * portal-visible appointments and invoices). Internal data never leaves this filter.
 */
export const portalMatterWhere = (ctx: ClientCtx) => ({ organizationId: ctx.org.id, clientId: ctx.user.clientId, portalEnabled: true, deletedAt: null });

export async function getPortalHome(ctx: ClientCtx) {
  const now = new Date();
  const matters = await db.matter.findMany({
    where: portalMatterWhere(ctx),
    orderBy: { lastActivityAt: "desc" },
    select: {
      id: true, internalNumber: true, officialCaseNumber: true, title: true, titleAr: true, status: true, portalStatusText: true, updatedAt: true,
      court: { select: { name: true, nameAr: true } },
      hearings: { where: { deletedAt: null, startsAt: { gte: now }, status: { in: ["SCHEDULED", "PREPARING", "READY"] } }, orderBy: { startsAt: "asc" }, take: 1, select: { startsAt: true } },
      notes: { where: { visibility: "CLIENT", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, body: true, createdAt: true } },
      documents: { where: { portalShared: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, category: true, updatedAt: true, currentVersion: true, versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, fileName: true } } } },
    },
  });
  const matterIds = matters.map((m) => m.id);
  const [appointments, invoices, messages] = await Promise.all([
    db.appointment.findMany({ where: { organizationId: ctx.org.id, clientId: ctx.user.clientId, portalVisible: true, deletedAt: null, startsAt: { gte: now }, status: { in: ["CONFIRMED", "REQUESTED"] } }, orderBy: { startsAt: "asc" }, take: 5, select: { id: true, title: true, startsAt: true, location: true, meetingUrl: true, type: true } }),
    db.invoice.findMany({ where: { organizationId: ctx.org.id, clientId: ctx.user.clientId, portalVisible: true, deletedAt: null, status: { not: "DRAFT" } }, orderBy: { issueDate: "desc" }, select: { id: true, number: true, total: true, amountPaid: true, status: true, dueDate: true, currency: true, payments: { select: { amount: true, receivedAt: true, method: true } } } }),
    db.communication.findMany({ where: { organizationId: ctx.org.id, channel: "PORTAL", matterId: { in: matterIds } }, orderBy: { occurredAt: "asc" }, take: 100, select: { id: true, matterId: true, body: true, direction: true, occurredAt: true } }),
  ]);
  return { matters, appointments, invoices, messages };
}

export async function portalSendMessage(ctx: ClientCtx, matterId: string, body: string) {
  const m = await db.matter.findFirst({ where: { ...portalMatterWhere(ctx), id: matterId }, select: { id: true, internalNumber: true, leadLawyerId: true, ownerId: true } });
  if (!m) throw notFound();
  await db.$transaction(async (tx) => {
    const c = await tx.communication.create({ data: { organizationId: ctx.org.id, matterId, clientId: ctx.user.clientId, channel: "PORTAL", direction: "INBOUND", subject: "Portal message", body, occurredAt: new Date(), userId: ctx.user.id } });
    await tx.client.update({ where: { id: ctx.user.clientId }, data: { lastContactAt: new Date() } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "portal.message_sent", entityType: "Communication", entityId: c.id, matterId }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [m.leadLawyerId, m.ownerId], category: "CLIENT", titleKey: "notif.portalMessage", params: { name: ctx.user.name }, link: `/app/cases/${matterId}/communications` }, tx);
  });
}

export async function portalUpload(ctx: ClientCtx, matterId: string, file: { name: string; buffer: Buffer }) {
  const m = await db.matter.findFirst({ where: { ...portalMatterWhere(ctx), id: matterId }, select: { id: true, leadLawyerId: true } });
  if (!m) throw notFound();
  if (file.buffer.length === 0 || file.buffer.length > MAX_UPLOAD_BYTES) throw new AppError("fileTooLarge", 413);
  file = { ...file, name: sanitizeFileName(file.name) };
  const { ext, mime } = sniff(file.name, file.buffer);
  const docId = randomUUID(), versionId = randomUUID();
  const key = `${ctx.org.id}/${docId}/${versionId}.${ext}`;
  await storage().put(key, file.buffer, mime);
  await db.$transaction(async (tx) => {
    await tx.document.create({
      data: {
        id: docId, organizationId: ctx.org.id, matterId, clientId: ctx.user.clientId, title: file.name.replace(/\.[^.]+$/, ""), category: "CLIENT", status: "DRAFT", portalShared: true,
        tags: ["client-upload"], createdById: ctx.user.id,
        versions: { create: { id: versionId, version: 1, fileName: file.name, storageKey: key, mimeType: mime, sizeBytes: BigInt(file.buffer.length), checksumSha256: createHash("sha256").update(file.buffer).digest("hex"), uploadedById: ctx.user.id, textStatus: "PENDING", scanStatus: initialScanStatus() } },
      },
    });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "portal.document_uploaded", entityType: "Document", entityId: docId, matterId }, tx);
    await notify({ organizationId: ctx.org.id, userIds: [m.leadLawyerId], category: "DOCUMENT", titleKey: "notif.documentReview", params: { title: file.name }, link: `/app/documents/${docId}` }, tx);
  });
  await scanVersion(versionId).catch(() => null);
  return { id: docId };
}

/** Resolve a version the client is allowed to download (shared document of an enabled matter of theirs). */
export async function portalVersion(ctx: ClientCtx, versionId: string) {
  const v = await db.documentVersion.findFirst({
    where: { id: versionId, document: { portalShared: true, deletedAt: null, organizationId: ctx.org.id, matter: portalMatterWhere(ctx) } },
    include: { document: { select: { id: true, matterId: true, currentVersion: true } } },
  });
  if (!v || v.version !== v.document.currentVersion) throw notFound();
  if (!isServable(v)) throw new AppError("fileQuarantined", 409);
  return v;
}

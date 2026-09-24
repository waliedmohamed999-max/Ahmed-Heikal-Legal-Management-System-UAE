import { stringList } from "@/lib/json-lists";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { DocumentStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit, diff } from "../audit";
import { storage } from "../storage";
import { matterAccess, matterScopeWhere } from "./access";
import { documentAccess } from "@/lib/access";
import type { MatterAction } from "@/lib/permissions";
import { logActivity, timelineEvent } from "./activity";
import { notify } from "./notifications";
import { runAutomations } from "./automation";
import { initialScanStatus, isServable, scanVersion } from "./malware";
import { fulltextDocumentIds } from "./fulltext";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024;
export const ALLOWED = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  zip: "application/zip",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
} as const;
type Ext = keyof typeof ALLOWED;

/** Executable / script signatures rejected regardless of the claimed extension. */
function looksExecutable(buf: Buffer) {
  const h = buf.subarray(0, 4);
  return (
    (h[0] === 0x4d && h[1] === 0x5a) || // MZ — Windows PE / DOS
    (h[0] === 0x7f && h[1] === 0x45 && h[2] === 0x4c && h[3] === 0x46) || // ELF
    [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(h.readUInt32BE(0)) || // Mach-O / fat / Java class
    (h[0] === 0x23 && h[1] === 0x21) // "#!" script
  );
}

/**
 * Extension allow-list + content checks:
 *  • executables and scripts are refused whatever the extension;
 *  • formats with a signature must match it (PDF, OOXML/ZIP, PNG, JPEG, OLE, WebP, TIFF);
 *  • text formats must not contain NUL bytes (binary disguised as .txt/.csv/.eml).
 */
export function sniff(fileName: string, buf: Buffer): { ext: Ext; mime: string } {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase() as Ext;
  if (!(ext in ALLOWED) || buf.length < 4) throw new AppError("fileType", 400);
  if (looksExecutable(buf)) throw new AppError("fileType", 400);
  const head = buf.subarray(0, 12);
  const is = (sig: number[], at = 0) => sig.every((b, i) => head[at + i] === b);
  const ok =
    ext === "pdf" ? is([0x25, 0x50, 0x44, 0x46]) :
    ["docx", "xlsx", "zip"].includes(ext) ? is([0x50, 0x4b, 0x03, 0x04]) || is([0x50, 0x4b, 0x05, 0x06]) :
    ext === "png" ? is([0x89, 0x50, 0x4e, 0x47]) :
    ["jpg", "jpeg"].includes(ext) ? is([0xff, 0xd8, 0xff]) :
    ["doc", "xls", "msg"].includes(ext) ? is([0xd0, 0xcf, 0x11, 0xe0]) :
    ext === "webp" ? is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8) :
    ["tif", "tiff"].includes(ext) ? is([0x49, 0x49, 0x2a, 0x00]) || is([0x4d, 0x4d, 0x00, 0x2a]) :
    ["txt", "csv", "eml"].includes(ext) ? !buf.subarray(0, 8192).includes(0) :
    false;
  if (!ok) throw new AppError("fileType", 400);
  return { ext, mime: ALLOWED[ext] };
}

/**
 * Display file name from client input: no path parts, control or bidi-override
 * characters (which can disguise "evil‮fdp.exe"), bounded length. Never used as a
 * storage path — objects are keyed by random UUIDs.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "file";
  if (cleaned.length <= 180) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 180 - ext.length) + ext;
}

// ─────────────────────────── Access ───────────────────────────
export async function loadDocumentForUser(ctx: StaffContext, id: string, need: "view" | "download" | "edit") {
  const doc = await db.document.findFirst({
    where: { id, organizationId: ctx.org.id, deletedAt: null },
    include: { permissions: { where: { OR: [{ userId: ctx.user.id }, { roleId: ctx.role.id }] } } },
  });
  if (!doc) throw notFound();
  let caps: Set<MatterAction>;
  let member = false;
  if (doc.matterId) {
    const acc = await matterAccess(ctx, doc.matterId);
    caps = acc.caps;
    member = acc.memberRole != null;
  } else {
    // Client-level documents (no matter): governed by role permissions.
    caps = new Set((["documents.view", "documents.download", "documents.edit", "documents.upload", "documents.approve", "documents.delete", "documents.share"] as MatterAction[]).filter((p) => ctx.can(p as never)));
    if (!ctx.can("clients.view")) caps = new Set();
  }
  // A highly confidential document inside a standard matter still needs explicit case membership.
  if (doc.confidentiality === "HIGHLY_CONFIDENTIAL" && !member) throw notFound();
  const a = documentAccess(caps, { confidentiality: doc.confidentiality, perms: doc.permissions });
  if (!a.view) throw notFound();
  if (need === "download" && !a.download) throw forbidden();
  if (need === "edit" && !a.edit) throw forbidden();
  return { doc, caps, access: a };
}

export function documentScope(ctx: StaffContext): Prisma.DocumentWhereInput {
  if (!ctx.can("documents.view")) return { id: { in: [] } };
  const now = new Date();
  return {
    organizationId: ctx.org.id,
    deletedAt: null,
    permissions: { none: { access: "DENY", OR: [{ userId: ctx.user.id }, { roleId: ctx.role.id }] } },
    AND: [
      { OR: [{ matter: matterScopeWhere(ctx) }, ...(ctx.can("clients.view") ? [{ matterId: null }] : [])] },
      { OR: [{ confidentiality: { not: "HIGHLY_CONFIDENTIAL" } }, { matter: { members: { some: { userId: ctx.user.id, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } }] },
    ],
  };
}

// ─────────────────────────── Listing ───────────────────────────
export const docListQuery = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export async function listDocuments(ctx: StaffContext, q: z.infer<typeof docListQuery>, matterId?: string) {
  const ci = q.q ? { contains: q.q } : undefined;
  // FULLTEXT candidates (ids only) — intersected with documentScope(ctx) in the same query.
  const ftIds = q.q ? await fulltextDocumentIds(ctx.org.id, q.q, 1000) : null;
  const textMatch: Prisma.DocumentWhereInput | undefined = ci
    ? { OR: [...(ftIds ? [{ id: { in: ftIds } }] : [{ title: ci }]), { description: ci }, { tags: { array_contains: q.q } }, { matter: { internalNumber: ci } }] }
    : undefined;
  const where: Prisma.DocumentWhereInput = {
    AND: [
      documentScope(ctx),
      matterId ? { matterId } : {},
      q.category ? { category: q.category as never } : {},
      q.status ? { status: q.status as never } : {},
      textMatch ?? {},
    ],
  };
  const [total, rows] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * 30, take: 30,
      include: {
        matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } },
        versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, fileName: true, sizeBytes: true, mimeType: true, textStatus: true, createdAt: true, uploadedBy: { select: { name: true, nameAr: true } } } },
      },
    }),
  ]);
  return {
    total,
    rows: rows.map((d) => ({
      id: d.id, title: d.title, category: d.category, status: d.status, confidentiality: d.confidentiality, tags: stringList(d.tags), currentVersion: d.currentVersion, portalShared: d.portalShared,
      updatedAt: d.updatedAt.toISOString(), matter: d.matter,
      latest: d.versions[0] ? { ...d.versions[0], sizeBytes: Number(d.versions[0].sizeBytes), createdAt: d.versions[0].createdAt.toISOString() } : null,
      snippet: q.q && d.searchText && !d.title.toLowerCase().includes(q.q.toLowerCase()) ? excerpt(d.searchText, q.q) : null,
    })),
  };
}

function excerpt(text: string | null, q: string) {
  if (!text) return null;
  const i = text.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0]);
  if (i < 0) return null;
  return "…" + text.slice(Math.max(0, i - 40), i + 90).replace(/\s+/g, " ") + "…";
}

// ─────────────────────────── Upload ───────────────────────────
export const uploadMetaSchema = z.object({
  matterId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  documentId: z.string().uuid().optional().nullable(), // present → new version
  title: z.string().trim().max(250).optional().nullable(),
  category: z.enum(["COURT", "CLIENT", "EVIDENCE", "CONTRACT", "LEGAL_MEMO", "CORRESPONDENCE", "JUDGMENT", "INVOICE", "POWER_OF_ATTORNEY", "EXPERT_REPORT", "SUBMISSION", "OTHER"]).default("OTHER"),
  description: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  confidentiality: z.enum(["STANDARD", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"]).default("STANDARD"),
  comment: z.string().max(1000).optional().nullable(),
  fileName: z.string().trim().max(250).optional().nullable(), // user-chosen name (naming convention suggestion is editable)
});

export function suggestFileName(parts: { number?: string | null; client?: string | null; category: string; date: Date; ext: string }) {
  const slug = (s: string) => s.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 30);
  return [parts.number ?? "AH", parts.client ? slug(parts.client) : null, parts.category, parts.date.toISOString().slice(0, 10)].filter(Boolean).join("_") + "." + parts.ext;
}

/**
 * Store an upload. The version starts quarantined (scanStatus PENDING) when a scanner is
 * configured and is scanned inline right after commit; the worker retries if clamd is
 * unavailable. Nothing can be previewed, downloaded, shared, OCR'd or sent to AI until CLEAN.
 */
export async function storeUpload(ctx: StaffContext, file: { name: string; buffer: Buffer }, meta: z.output<typeof uploadMetaSchema>) {
  const r = await storeUploadRaw(ctx, { name: sanitizeFileName(file.name), buffer: file.buffer }, { ...meta, fileName: meta.fileName ? sanitizeFileName(meta.fileName) : meta.fileName });
  await scanVersion(r.versionId).catch(() => null);
  return { id: r.id, version: r.version };
}

async function storeUploadRaw(ctx: StaffContext, file: { name: string; buffer: Buffer }, meta: z.output<typeof uploadMetaSchema>) {
  if (file.buffer.length === 0) throw new AppError("validation", 400, { file: "required" });
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw new AppError("fileTooLarge", 413);
  const { ext, mime } = sniff(file.name, file.buffer);
  const checksum = createHash("sha256").update(file.buffer).digest("hex");

  // New version of an existing document
  if (meta.documentId) {
    const { doc, caps } = await loadDocumentForUser(ctx, meta.documentId, "view");
    if (!caps.has("documents.upload")) throw forbidden();
    const versionId = randomUUID();
    const key = `${ctx.org.id}/${doc.id}/${versionId}.${ext}`;
    await storage().put(key, file.buffer, mime);
    try {
      return await db.$transaction(async (tx) => {
        // Serialise version numbering per document
        await tx.$queryRaw`SELECT id FROM \`Document\` WHERE id = ${doc.id} FOR UPDATE`;
        const last = await tx.documentVersion.aggregate({ where: { documentId: doc.id }, _max: { version: true } });
        const version = (last._max.version ?? 0) + 1;
        await tx.documentVersion.create({
          data: { id: versionId, documentId: doc.id, version, fileName: meta.fileName || file.name, storageKey: key, mimeType: mime, sizeBytes: BigInt(file.buffer.length), checksumSha256: checksum, uploadedById: ctx.user.id, comment: meta.comment, status: "DRAFT", textStatus: "PENDING", scanStatus: initialScanStatus() },
        });
        // A new version always restarts the approval workflow — approvals never carry over silently.
        await tx.document.update({ where: { id: doc.id }, data: { currentVersion: version, status: "DRAFT", updatedById: ctx.user.id } });
        await tx.approval.updateMany({ where: { entityType: "Document", entityId: doc.id, status: "PENDING" }, data: { status: "CANCELLED" as never } }).catch(() => undefined);
        if (doc.matterId) await logActivity({ organizationId: ctx.org.id, matterId: doc.matterId, actorId: ctx.user.id, type: "document.version_uploaded", entityType: "Document", entityId: doc.id, data: { title: doc.title, version: String(version) } }, tx);
        await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "document.version_uploaded", entityType: "Document", entityId: doc.id, matterId: doc.matterId, after: { version, checksum, size: file.buffer.length } }, tx);
        return { id: doc.id, version, versionId };
      });
    } catch (e) {
      await storage().remove(key);
      throw e;
    }
  }

  // New document
  let caps: Set<MatterAction> | null = null;
  let matter: { id: string; internalNumber: string; leadLawyerId: string | null; ownerId: string; client: { nameEn: string } } | null = null;
  if (meta.matterId) {
    const acc = await matterAccess(ctx, meta.matterId);
    if (!acc.has("documents.upload")) throw acc.has("matters.view") ? forbidden() : notFound();
    caps = acc.caps;
    matter = await db.matter.findUniqueOrThrow({ where: { id: meta.matterId }, select: { id: true, internalNumber: true, leadLawyerId: true, ownerId: true, client: { select: { nameEn: true } } } });
  } else {
    if (!ctx.can("documents.upload") || !ctx.can("clients.view")) throw forbidden();
    if (meta.clientId && !(await db.client.findFirst({ where: { id: meta.clientId, organizationId: ctx.org.id } }))) throw notFound();
  }
  if (meta.confidentiality === "HIGHLY_CONFIDENTIAL" && caps && !caps.has("matters.manageMembers") && !caps.has("documents.approve")) {
    // Juniors can upload, but marking material highly confidential is a senior decision.
    meta.confidentiality = "CONFIDENTIAL";
  }
  const docId = randomUUID();
  const versionId = randomUUID();
  const key = `${ctx.org.id}/${docId}/${versionId}.${ext}`;
  await storage().put(key, file.buffer, mime);
  try {
    return await db.$transaction(async (tx) => {
      const title = meta.title || file.name.replace(/\.[^.]+$/, "");
      await tx.document.create({
        data: {
          id: docId, organizationId: ctx.org.id, matterId: meta.matterId ?? null, clientId: meta.clientId ?? null, title, description: meta.description, category: meta.category,
          tags: meta.tags, confidentiality: meta.confidentiality, status: "DRAFT", currentVersion: 1, createdById: ctx.user.id, updatedById: ctx.user.id,
          versions: {
            create: { id: versionId, version: 1, fileName: meta.fileName || file.name, storageKey: key, mimeType: mime, sizeBytes: BigInt(file.buffer.length), checksumSha256: checksum, uploadedById: ctx.user.id, comment: meta.comment, textStatus: "PENDING", scanStatus: initialScanStatus() },
          },
        },
      });
      if (matter) {
        await logActivity({ organizationId: ctx.org.id, matterId: matter.id, actorId: ctx.user.id, type: "document.uploaded", entityType: "Document", entityId: docId, data: { title } }, tx);
        await runAutomations(tx, "document.uploaded", { organizationId: ctx.org.id, actorId: ctx.user.id, entityId: docId, matter, label: title, fields: { category: meta.category } });
      }
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "document.uploaded", entityType: "Document", entityId: docId, matterId: meta.matterId, after: { title, category: meta.category, checksum, size: file.buffer.length, confidentiality: meta.confidentiality } }, tx);
      return { id: docId, version: 1, versionId };
    });
  } catch (e) {
    await storage().remove(key);
    throw e;
  }
}

// ─────────────────────────── Metadata & workflow ───────────────────────────
export const docMetaSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "required").max(250),
  description: z.string().max(4000).optional().nullable(),
  category: uploadMetaSchema.shape.category,
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  confidentiality: uploadMetaSchema.shape.confidentiality,
  portalShared: z.boolean(),
});

export async function updateDocumentMeta(ctx: StaffContext, input: z.output<typeof docMetaSchema>) {
  const { doc, caps } = await loadDocumentForUser(ctx, input.id, "edit");
  if (input.portalShared !== doc.portalShared && !caps.has("documents.share")) throw forbidden();
  if (input.portalShared && !doc.portalShared) {
    // Sharing model: documents are Internal Only by default. Highly confidential material and
    // files that have not passed malware scanning can never be shared to the client portal.
    if (input.confidentiality === "HIGHLY_CONFIDENTIAL") throw new AppError("shareRestricted", 400);
    const current = await db.documentVersion.findFirst({ where: { documentId: doc.id, version: doc.currentVersion }, select: { scanStatus: true, integrityStatus: true } });
    if (!current || !isServable(current)) throw new AppError("fileQuarantined", 409);
  }
  if (input.confidentiality !== doc.confidentiality && !caps.has("documents.approve") && !caps.has("matters.manageMembers")) throw forbidden();
  const { id, ...data } = input;
  const d = diff(doc as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { ...data, updatedById: ctx.user.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: d.changed.includes("portalShared") ? "document.sharing_changed" : "document.updated", entityType: "Document", entityId: id, matterId: doc.matterId, before: d.before, after: d.after }, tx);
  });
}

/**
 * Approval workflow: DRAFT → UNDER_REVIEW → (CHANGES_REQUESTED ↺) → APPROVED → SUBMITTED.
 * Only holders of documents.approve can approve / request changes / mark submitted.
 */
const TRANSITIONS: Record<DocumentStatus, { to: DocumentStatus; needs: MatterAction }[]> = {
  DRAFT: [{ to: "UNDER_REVIEW", needs: "documents.upload" }],
  CHANGES_REQUESTED: [{ to: "UNDER_REVIEW", needs: "documents.upload" }],
  UNDER_REVIEW: [{ to: "APPROVED", needs: "documents.approve" }, { to: "CHANGES_REQUESTED", needs: "documents.approve" }, { to: "DRAFT", needs: "documents.upload" }],
  APPROVED: [{ to: "SUBMITTED", needs: "documents.approve" }, { to: "UNDER_REVIEW", needs: "documents.approve" }],
  SUBMITTED: [],
};

export async function transitionDocument(ctx: StaffContext, id: string, to: DocumentStatus, comment?: string | null) {
  const { doc, caps } = await loadDocumentForUser(ctx, id, "view");
  const rule = TRANSITIONS[doc.status].find((r) => r.to === to);
  if (!rule) throw new AppError("invalidTransition", 400);
  if (!caps.has(rule.needs)) throw forbidden();
  const matter = doc.matterId ? await db.matter.findUnique({ where: { id: doc.matterId }, select: { id: true, internalNumber: true, ownerId: true, leadLawyerId: true } }) : null;
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { status: to, updatedById: ctx.user.id } });
    await tx.documentVersion.updateMany({ where: { documentId: id, version: doc.currentVersion }, data: { status: to, comment: comment ?? undefined } });
    if (to === "UNDER_REVIEW") {
      // Route to the case lead (or owner) for review
      const reviewer = matter?.leadLawyerId && matter.leadLawyerId !== ctx.user.id ? matter.leadLawyerId : matter?.ownerId ?? null;
      await tx.approval.create({
        data: { organizationId: ctx.org.id, kind: "DOCUMENT", entityType: "Document", entityId: id, matterId: doc.matterId, title: `${doc.title} (v${doc.currentVersion})`, requestedById: ctx.user.id, assignedToId: reviewer, comment },
      });
      await notify({ organizationId: ctx.org.id, userIds: [reviewer], excludeUserId: ctx.user.id, category: "DOCUMENT", titleKey: "notif.documentReview", params: { title: doc.title }, link: `/app/documents/${id}` }, tx);
    } else {
      const pending = await tx.approval.findMany({ where: { entityType: "Document", entityId: id, status: "PENDING" } });
      for (const p of pending) {
        await tx.approval.update({ where: { id: p.id }, data: { status: to === "APPROVED" ? "APPROVED" : to === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "CANCELLED", decidedAt: new Date(), comment: comment ?? p.comment, assignedToId: ctx.user.id } });
        if (p.requestedById) await notify({ organizationId: ctx.org.id, userIds: [p.requestedById], excludeUserId: ctx.user.id, category: "DOCUMENT", titleKey: "notif.documentDecision", params: { title: doc.title, status: to }, link: `/app/documents/${id}` }, tx);
      }
    }
    if (to === "APPROVED" && doc.matterId) await timelineEvent(tx, { matterId: doc.matterId, eventType: "DOCUMENT_APPROVED", title: doc.title, userId: ctx.user.id, documentIds: [id] });
    if (doc.matterId) await logActivity({ organizationId: ctx.org.id, matterId: doc.matterId, actorId: ctx.user.id, type: to === "APPROVED" ? "document.approved" : "document.status_changed", entityType: "Document", entityId: id, data: { title: doc.title, status: to } }, tx);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: `document.${to.toLowerCase()}`, entityType: "Document", entityId: id, matterId: doc.matterId, before: { status: doc.status }, after: { status: to, version: doc.currentVersion, comment } }, tx);
  });
}

export async function deleteDocument(ctx: StaffContext, id: string) {
  const { doc, caps } = await loadDocumentForUser(ctx, id, "view");
  if (!caps.has("documents.delete")) throw forbidden();
  if (doc.status === "SUBMITTED") throw new AppError("invalidTransition", 400);
  await db.$transaction(async (tx) => {
    // Soft delete: files and versions are retained (legal retention); only hidden from the vault.
    await tx.document.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.user.id } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "document.deleted", entityType: "Document", entityId: id, matterId: doc.matterId, before: { title: doc.title, status: doc.status } }, tx);
  });
}

export async function getDocumentDetail(ctx: StaffContext, id: string) {
  const { doc, caps, access } = await loadDocumentForUser(ctx, id, "view");
  const [full, approvals] = await Promise.all([
    db.document.findUniqueOrThrow({
      where: { id },
      include: {
        matter: { select: { id: true, internalNumber: true, title: true, titleAr: true } },
        client: { select: { id: true, nameEn: true, nameAr: true } },
        versions: { orderBy: { version: "desc" }, include: { uploadedBy: { select: { name: true, nameAr: true } } } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, nameAr: true, photoUrl: true } } } },
      },
    }),
    db.approval.findMany({ where: { entityType: "Document", entityId: id }, orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { name: true, nameAr: true } }, assignedTo: { select: { name: true, nameAr: true } } } }),
  ]);
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "document.viewed", entityType: "Document", entityId: id, matterId: doc.matterId });
  return { doc: full, caps: [...caps], access, approvals, transitions: TRANSITIONS[doc.status].filter((r) => caps.has(r.needs)).map((r) => r.to) };
}

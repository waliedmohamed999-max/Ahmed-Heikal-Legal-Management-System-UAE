import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { loadStaffContext } from "@/server/auth/session";
import { verifyFileSignature, storage } from "@/server/storage";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { loadDocumentForUser } from "@/server/services/documents";
import { isServable } from "@/server/services/malware";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { errMsg, logger } from "@/server/log";

export const runtime = "nodejs";
const log = logger("files");

/**
 * Document download / preview. Order of checks:
 *   session (+MFA) → user-bound HMAC link (expires in minutes) → case + document
 *   permission (live) → malware / integrity state → audit → deliver.
 * Delivery: inline previews stream through the app (same-origin CSP); downloads from S3
 * redirect to a presigned URL that expires after SIGNED_URL_TTL_SECONDS (default 300 s).
 * A leaked link is useless to anyone else and expires quickly.
 */
export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const url = new URL(req.url);
  const disposition = url.searchParams.get("d") === "attachment" ? "attachment" : "inline";
  const ctx = await loadStaffContext();
  if (!ctx || (ctx.mfaRequired && !ctx.mfaVerified) || ctx.mfaEnrollmentRequired) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(versionId) || !verifyFileSignature(versionId, ctx.user.id, url.searchParams.get("exp"), url.searchParams.get("sig"), disposition)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const v = await db.documentVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new AppError("notFound", 404);
    const { doc } = await loadDocumentForUser(ctx, v.documentId, disposition === "attachment" ? "download" : "view");
    if (!isServable(v)) {
      await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "document.access_blocked", entityType: "Document", entityId: doc.id, matterId: doc.matterId, metadata: { versionId: v.id, scanStatus: v.scanStatus, integrity: v.integrityStatus } });
      throw new AppError("fileQuarantined", 409);
    }
    await audit({
      organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: disposition === "attachment" ? "document.downloaded" : "document.previewed",
      entityType: "Document", entityId: doc.id, matterId: doc.matterId, metadata: { version: v.version, checksum: v.checksumSha256 },
    });
    const store = storage();
    if (disposition === "attachment") {
      const presigned = await store.presignedGet(v.storageKey, { fileName: v.fileName, contentType: v.mimeType, disposition, ttlSeconds: env().SIGNED_URL_TTL_SECONDS });
      if (presigned) return NextResponse.redirect(presigned, { status: 302, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    const { stream, size } = await store.stream(v.storageKey);
    const safeName = encodeURIComponent(v.fileName).replace(/['()]/g, escape);
    return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
      headers: {
        "content-type": v.mimeType,
        "content-length": String(size),
        "content-disposition": `${disposition}; filename*=UTF-8''${safeName}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        // Allow our own pages to embed PDFs for preview; nothing else.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
        "x-frame-options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    if (!(e instanceof AppError)) log.error("file delivery failed", { versionId, error: errMsg(e) });
    const status = e instanceof AppError ? e.status : 500;
    return NextResponse.json({ error: e instanceof AppError ? e.code : "unexpected" }, { status });
  }
}

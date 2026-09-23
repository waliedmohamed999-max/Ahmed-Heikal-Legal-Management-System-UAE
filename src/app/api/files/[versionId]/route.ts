import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getStaffContext } from "@/server/auth/session";
import { verifyFileSignature, storage } from "@/server/storage";
import { db } from "@/server/db";
import { loadDocumentForUser } from "@/server/services/documents";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";

/**
 * Serves a document version. Requires BOTH a valid short-lived signature bound to
 * this user AND a live permission check — a leaked link is useless to anyone else
 * and expires within minutes. Every view/download is audited.
 */
export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const url = new URL(req.url);
  const disposition = url.searchParams.get("d") === "attachment" ? "attachment" : "inline";
  const ctx = await getStaffContext();
  if (!ctx || (ctx.mfaRequired && !ctx.mfaVerified)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(versionId) || !verifyFileSignature(versionId, ctx.user.id, url.searchParams.get("exp"), url.searchParams.get("sig"), disposition)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const v = await db.documentVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new AppError("notFound", 404);
    const { doc } = await loadDocumentForUser(ctx, v.documentId, disposition === "attachment" ? "download" : "view");
    const { stream, size } = await storage().stream(v.storageKey);
    await audit({
      organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: disposition === "attachment" ? "document.downloaded" : "document.previewed",
      entityType: "Document", entityId: doc.id, matterId: doc.matterId, metadata: { version: v.version, checksum: v.checksumSha256 },
    });
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
    const status = e instanceof AppError ? e.status : 500;
    return NextResponse.json({ error: e instanceof AppError ? e.code : "unexpected" }, { status });
  }
}

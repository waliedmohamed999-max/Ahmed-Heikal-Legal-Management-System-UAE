import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { loadClientContext } from "@/server/auth/session";
import { portalVersion } from "@/server/services/portal";
import { storage } from "@/server/storage";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { errMsg, logger } from "@/server/log";

export const runtime = "nodejs";
const log = logger("portal-files");

/**
 * Client downloads: only the current version of documents explicitly shared to the
 * portal, on matters of the client's own record with the portal enabled, and only if
 * the file passed malware scanning. Anything else is indistinguishable from "not found".
 */
export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const ctx = await loadClientContext();
  if (!ctx || !ctx.user.clientId || !ctx.can("portal.access")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { versionId } = await params;
  try {
    if (!/^[0-9a-f-]{36}$/i.test(versionId)) throw new AppError("notFound", 404);
    const v = await portalVersion(ctx as never, versionId);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "portal.document_downloaded", entityType: "Document", entityId: v.document.id, matterId: v.document.matterId });
    const presigned = await storage().presignedGet(v.storageKey, { fileName: v.fileName, contentType: v.mimeType, disposition: "attachment", ttlSeconds: env().SIGNED_URL_TTL_SECONDS });
    if (presigned) return NextResponse.redirect(presigned, { status: 302, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    const { stream, size } = await storage().stream(v.storageKey);
    return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
      headers: { "content-type": v.mimeType, "content-length": String(size), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(v.fileName)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    if (!(e instanceof AppError)) log.error("portal file delivery failed", { versionId, error: errMsg(e) });
    return NextResponse.json({ error: e instanceof AppError ? e.code : "unexpected" }, { status: e instanceof AppError ? e.status : 500 });
  }
}

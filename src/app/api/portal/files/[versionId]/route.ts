import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getClientContext } from "@/server/auth/session";
import { portalVersion } from "@/server/services/portal";
import { storage } from "@/server/storage";
import { audit } from "@/server/audit";
import { AppError } from "@/server/errors";

export const runtime = "nodejs";

/** Client downloads: only the current version of documents explicitly shared to the portal. */
export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const ctx = await getClientContext();
  if (!ctx || !ctx.user.clientId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { versionId } = await params;
  try {
    if (!/^[0-9a-f-]{36}$/i.test(versionId)) throw new AppError("notFound", 404);
    const v = await portalVersion(ctx as never, versionId);
    const { stream, size } = await storage().stream(v.storageKey);
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "portal.document_downloaded", entityType: "Document", entityId: v.document.id, matterId: v.document.matterId });
    return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
      headers: { "content-type": v.mimeType, "content-length": String(size), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(v.fileName)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AppError ? e.code : "unexpected" }, { status: e instanceof AppError ? e.status : 500 });
  }
}

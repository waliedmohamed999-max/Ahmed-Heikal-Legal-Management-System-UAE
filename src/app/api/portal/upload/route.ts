import { NextResponse } from "next/server";
import { getClientContext } from "@/server/auth/session";
import { portalUpload } from "@/server/services/portal";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getClientContext();
  if (!ctx || !ctx.user.clientId || !ctx.can("portal.access")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`portal-upload:${ctx.user.id}`, 20, 3600)).ok) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const matterId = String(form.get("matterId") ?? "");
    if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(matterId)) throw new AppError("validation", 400);
    const r = await portalUpload(ctx as never, matterId, { name: file.name.slice(0, 200), buffer: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof AppError ? e.code : "unexpected" }, { status: e instanceof AppError ? e.status : 500 });
  }
}

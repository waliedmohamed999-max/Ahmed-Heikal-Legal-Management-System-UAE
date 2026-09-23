import { staffRoute } from "@/server/api";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { createImport } from "@/server/services/court-import";
import { courtImportTextSchema } from "@/lib/court-import";

export const runtime = "nodejs";

/** Multipart: `file` (court PDF / CSV / TXT / EML / DOCX / image) or `text` (pasted), plus optional `matterId`. */
export const POST = staffRoute(async (req, ctx) => {
  const rl = await rateLimit(`court-import:${ctx.user.id}`, 30, 60);
  if (!rl.ok) throw new AppError("rateLimited", 429);
  if (Number(req.headers.get("content-length") ?? 0) > 21 * 1024 * 1024) throw new AppError("fileTooLarge", 413);
  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError("validation", 400);
  const matterId = String(form.get("matterId") ?? "") || null;
  if (matterId && !/^[0-9a-f-]{36}$/i.test(matterId)) throw new AppError("validation", 400);
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    return createImport(ctx, { matterId, file: { name: file.name.slice(0, 250), buffer: Buffer.from(await file.arrayBuffer()) } });
  }
  const parsed = courtImportTextSchema.safeParse({ text: String(form.get("text") ?? ""), matterId: matterId ?? "" });
  if (!parsed.success) throw new AppError("validation", 400, { text: "required" });
  return createImport(ctx, { matterId, text: parsed.data.text });
});

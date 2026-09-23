import { staffRoute } from "@/server/api";
import { AppError } from "@/server/errors";
import { MAX_UPLOAD_BYTES, storeUpload, uploadMetaSchema } from "@/server/services/documents";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** Multipart upload: one file per request (the client sends multiple files in parallel with progress). */
export const POST = staffRoute(async (req, ctx) => {
  const rl = await rateLimit(`upload:${ctx.user.id}`, 60, 60);
  if (!rl.ok) throw new AppError("rateLimited", 429);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 1024 * 1024) throw new AppError("fileTooLarge", 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new AppError("validation", 400, { file: "required" });
  let metaRaw: unknown = {};
  try {
    metaRaw = JSON.parse(String(form.get("meta") ?? "{}"));
  } catch {
    throw new AppError("validation", 400);
  }
  const meta = uploadMetaSchema.safeParse(metaRaw);
  if (!meta.success) throw new AppError("validation", 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  return storeUpload(ctx, { name: file.name.slice(0, 250), buffer }, meta.data);
});

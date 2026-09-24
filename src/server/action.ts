import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import { requireStaff, type StaffContext } from "./auth/session";
import { rateLimit } from "./rate-limit";
import { errMsg, logger } from "./log";

const log = logger("action");

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Map a zod issue to a translation key under `validation.*`. Custom messages are already keys. */
export function issueKey(issue: z.core.$ZodIssue): string {
  if (issue.message && /^[a-zA-Z]+$/.test(issue.message) && !issue.message.includes(" ")) return issue.message;
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined || issue.input === null ? "required" : "invalid";
    case "too_small":
      return issue.minimum === 1 ? "required" : "tooShort";
    case "too_big":
      return "tooLong";
    case "invalid_format":
      return issue.format === "email" ? "email" : "invalid";
    default:
      return "invalid";
  }
}

export function toFieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".") || "_";
    if (!out[k]) out[k] = issueKey(i);
  }
  return out;
}

export function handleError(e: unknown): ActionResult<never> {
  if (e instanceof AppError) return { ok: false, error: e.code, fieldErrors: e.fieldErrors };
  if (e instanceof z.ZodError) return { ok: false, error: "validation", fieldErrors: toFieldErrors(e) };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return { ok: false, error: "notFound" };
    if (e.code === "P2002") return { ok: false, error: "conflict" };
  }
  // Redirects thrown by next/navigation must propagate
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  // Log server-side only; the client receives a generic code (no stack traces / SQL).
  log.error("unexpected action error", { error: errMsg(e) });
  return { ok: false, error: "unexpected" };
}

/**
 * Wrap a staff mutation: authenticate, rate-limit, validate, execute, normalise errors.
 * Handlers perform their own permission + record-level checks via the service layer.
 */
export function staffAction<S extends z.ZodType, R>(schema: S, handler: (input: z.infer<S>, ctx: StaffContext) => Promise<R>) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const ctx = await requireStaff();
      const rl = await rateLimit(`act:${ctx.user.id}`, 240, 60);
      if (!rl.ok) return { ok: false, error: "rateLimited" };
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: "validation", fieldErrors: toFieldErrors(parsed.error) };
      return { ok: true, data: await handler(parsed.data, ctx) };
    } catch (e) {
      return handleError(e);
    }
  };
}

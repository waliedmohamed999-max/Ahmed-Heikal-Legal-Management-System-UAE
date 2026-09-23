import "server-only";
import { NextResponse } from "next/server";
import { getStaffContext, type StaffContext } from "./auth/session";
import { AppError } from "./errors";
import { rateLimit } from "./rate-limit";

/**
 * Route-handler wrapper for the JSON API: session auth, MFA gate, rate limit,
 * error normalisation (no stack traces or SQL leak to clients), no-store caching.
 */
export function staffRoute(handler: (req: Request, ctx: StaffContext, params: Record<string, string>) => Promise<unknown>, opts: { limit?: number } = {}) {
  return async (req: Request, route: { params: Promise<Record<string, string>> }) => {
    const ctx = await getStaffContext();
    if (!ctx || (ctx.mfaRequired && !ctx.mfaVerified)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit(`api:${ctx.user.id}`, opts.limit ?? 300, 60);
    if (!rl.ok) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
    try {
      const out = await handler(req, ctx, (await route.params) ?? {});
      if (out instanceof Response) return out;
      return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof AppError) return NextResponse.json({ error: e.code, fieldErrors: e.fieldErrors }, { status: e.status });
      console.error("[api]", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "unexpected" }, { status: 500 });
    }
  };
}

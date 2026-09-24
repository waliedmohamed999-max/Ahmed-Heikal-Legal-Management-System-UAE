import { NextResponse } from "next/server";
import { readiness } from "@/server/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Readiness: database, object storage and Redis reachable. 503 when not ready. */
export async function GET() {
  const r = await readiness();
  return NextResponse.json({ status: r.ok ? "ok" : "unavailable", checks: r.checks }, { status: r.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { readiness } from "@/server/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Same as /health/ready: status only, 503 when a dependency is down. */
export async function GET() {
  const r = await readiness();
  return NextResponse.json({ status: r.ok ? "ok" : "unavailable", checks: r.checks }, { status: r.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

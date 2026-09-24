import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { loadStaffContext } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner / admin export of the office's data (NDJSON, one table after another).
 *  • Requires roles.manage (owner-level) AND a step-up re-authentication in the last 5 minutes.
 *  • Audited before streaming starts.
 *  • Never exports authentication secrets (password hashes, MFA secrets, sessions, one-time
 *    tokens, recovery codes). Field-encrypted values (Emirates ID, passport) stay encrypted:
 *    they can only be read with this deployment's DATA_ENCRYPTION_KEY.
 *  • Document binaries are not included — they are covered by the document-store backup.
 */
const STEP_UP_WINDOW_MS = 5 * 60_000;
const SKIP = new Set(["Session", "AuthToken", "MfaRecoveryCode", "PushSubscription", "SystemStatus"]);
const USER_SECRET_FIELDS = ["passwordHash", "mfaSecretEnc", "mfaPendingSecretEnc", "mfaLastStep"];

export async function GET() {
  const ctx = await loadStaffContext();
  if (!ctx || (ctx.mfaRequired && !ctx.mfaVerified) || ctx.mfaEnrollmentRequired) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.can("roles.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ctx.stepUpAt || Date.now() - ctx.stepUpAt.getTime() > STEP_UP_WINDOW_MS) return NextResponse.json({ error: "reauthRequired" }, { status: 403 });

  const models = Prisma.dmmf.datamodel.models.map((m) => m.name).filter((n) => !SKIP.has(n));
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "privacy.office_exported", entityType: "Organization", entityId: ctx.org.id, metadata: { tables: models.length } });

  const model = (name: string) => Prisma.dmmf.datamodel.models.find((m) => m.name === name);
  const orgScoped = (name: string) => !!model(name)?.fields.some((f) => f.name === "organizationId");
  /** Tenant filter: own organizationId, or (child tables) through a required parent relation that has one. */
  const scopeOf = (name: string): object | undefined => {
    if (name === "Organization") return { id: ctx!.org.id };
    if (orgScoped(name)) return { organizationId: ctx!.org.id };
    const parent = model(name)?.fields.find((f) => f.kind === "object" && !f.isList && f.isRequired && orgScoped(f.type));
    return parent ? { [parent.name]: { organizationId: ctx!.org.id } } : undefined;
  };
  async function* rows() {
    yield JSON.stringify({ format: "ahl-office-export/1", exportedAt: new Date().toISOString(), organizationId: ctx!.org.id }) + "\n";
    for (const name of models) {
      const delegate = (db as unknown as Record<string, { findMany: (a: object) => Promise<Record<string, unknown>[]> }>)[name[0].toLowerCase() + name.slice(1)];
      if (!delegate) continue;
      const where = scopeOf(name);
      if (!where && name !== "Permission") continue; // no tenant path: never exported unscoped (Permission is global reference data)
      let skip = 0;
      for (;;) {
        const batch = await delegate.findMany({ ...(where ? { where } : {}), take: 500, skip });
        for (const r of batch) {
          if (name === "User") for (const f of USER_SECRET_FIELDS) delete r[f];
          yield JSON.stringify({ table: name, row: r }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n";
        }
        if (batch.length < 500) break;
        skip += 500;
      }
    }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(Readable.toWeb(Readable.from(rows())) as ReadableStream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "content-disposition": `attachment; filename="office-export-${stamp}.ndjson"`, "cache-control": "no-store" },
  });
}

import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { sha256 } from "./crypto";
import { requestMeta } from "./request";

export type AuditInput = {
  organizationId: string;
  actorId?: string | null;
  sessionId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  matterId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

const SENSITIVE = /password|secret|token|emiratesid|passport|mfa/i;

/** Strip secrets from snapshots so the audit log never becomes a leak vector. */
export function redact(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "bigint") return v.toString();
  if (typeof v !== "object") return v;
  if (v instanceof Date) return v.toISOString();
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toString();
  if (Array.isArray(v)) return v.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(val);
  }
  return out;
}

/** Keep only keys whose values changed — before/after stay meaningful and small. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (after[k] === undefined) continue;
    const bv = JSON.stringify(redact(before[k]) ?? null);
    const av = JSON.stringify(redact(after[k]) ?? null);
    if (bv !== av) {
      b[k] = redact(before[k]);
      a[k] = redact(after[k]);
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

/** Deterministic JSON (sorted keys) — jsonb does not preserve key order, so hashes must not depend on it. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}

const json = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (redact(v) as Prisma.InputJsonValue);

/**
 * Append a hash-chained audit record. A transaction-scoped advisory lock keeps the
 * chain linear under concurrency. Pass `tx` to join the caller's transaction so the
 * audit row commits (or rolls back) together with the change it describes.
 */
export async function audit(input: AuditInput, tx?: Tx) {
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
  const run = async (t: Tx) => {
    // One chain per organisation, serialised per organisation.
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.organizationId}))`;
    const last = await t.auditLog.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: { seq: "desc" },
      select: { hash: true },
    });
    const createdAt = new Date();
    const hash = sha256(
      (last?.hash ?? "GENESIS") +
        canonical({
          organizationId: input.organizationId,
          actorId: input.actorId ?? null,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          matterId: input.matterId ?? null,
          before: redact(input.before) ?? null,
          after: redact(input.after) ?? null,
          createdAt: createdAt.toISOString(),
        }),
    );
    await t.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId ?? null,
        sessionId: input.sessionId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        matterId: input.matterId ?? null,
        before: json(input.before),
        after: json(input.after),
        metadata: json(input.metadata),
        ip: meta.ip,
        userAgent: meta.userAgent,
        prevHash: last?.hash ?? null,
        hash,
        createdAt,
      },
    });
  };
  if (tx) return run(tx);
  return db.$transaction(run);
}

/** Recompute the chain and report the first broken link (Settings → Audit → Verify integrity). */
export async function verifyAuditChain(organizationId: string) {
  let prev: string | null = null;
  let checked = 0;
  let cursor: bigint | undefined;
  for (;;) {
    const rows: Awaited<ReturnType<typeof db.auditLog.findMany>> = await db.auditLog.findMany({
      where: { organizationId, ...(cursor ? { seq: { gt: cursor } } : {}) },
      orderBy: { seq: "asc" },
      take: 1000,
    });
    if (!rows.length) break;
    for (const r of rows) {
      const expected = sha256(
        (r.prevHash ?? "GENESIS") +
          canonical({
            organizationId: r.organizationId,
            actorId: r.actorId,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            matterId: r.matterId,
            before: r.before ?? null,
            after: r.after ?? null,
            createdAt: r.createdAt.toISOString(),
          }),
      );
      if (expected !== r.hash || (prev !== null && r.prevHash !== prev)) {
        return { ok: false as const, checked, brokenAt: r.id };
      }
      prev = r.hash;
      checked++;
    }
    cursor = rows[rows.length - 1].seq;
  }
  return { ok: true as const, checked };
}

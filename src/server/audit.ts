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

export { redact, diff, canonical } from "./audit-format";
import { redact, canonical } from "./audit-format";

const json = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (redact(v) as Prisma.InputJsonValue);

/**
 * Append a hash-chained audit record. A transaction-scoped row lock keeps the
 * chain linear under concurrency. Pass `tx` to join the caller's transaction so the
 * audit row commits (or rolls back) together with the change it describes.
 */
export async function audit(input: AuditInput, tx?: Tx) {
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
  const run = async (t: Tx) => {
    // One chain per organisation, serialised per organisation.
    await t.$queryRaw`SELECT id FROM \`Organization\` WHERE id = ${input.organizationId} FOR UPDATE`;
    const [last] = await t.$queryRaw<{ hash: string }[]>`
      SELECT hash FROM \`AuditLog\` WHERE \`organizationId\` = ${input.organizationId}
      ORDER BY seq DESC LIMIT 1 FOR UPDATE`;
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
export async function verifyAuditChain(organizationId: string, client: Pick<typeof db, "auditLog"> = db) {
  let prev: string | null = null;
  let checked = 0;
  let cursor: bigint | undefined;
  for (;;) {
    const rows: Awaited<ReturnType<typeof db.auditLog.findMany>> = await client.auditLog.findMany({
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

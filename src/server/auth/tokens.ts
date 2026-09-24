import "server-only";
import type { AuthTokenKind } from "@prisma/client";
import { db, type Tx } from "../db";
import { hmac, randomToken } from "../crypto";
import { env } from "../env";

/**
 * One-time tokens for password reset and invitations.
 *  • 256-bit random token; only HMAC-SHA256(SESSION_SECRET, token) is stored, so a
 *    database leak does not yield usable links.
 *  • Bound to one e-mail address (and role / cases for invitations).
 *  • Short expiry; single use (atomic conditional UPDATE); issuing a new token
 *    revokes the previous unused ones for the same address.
 *  • Links carry the token in the URL *fragment* (#…), which browsers never send to
 *    the server, so it does not appear in access logs or Referer headers.
 */
export const TOKEN_TTL_MS: Record<AuthTokenKind, number> = {
  PASSWORD_RESET: 30 * 60_000,
  INVITATION: 7 * 24 * 3600_000,
};

export const tokenDigest = (raw: string) => hmac(env().SESSION_SECRET, `auth-token:${raw}`);

export async function issueToken(
  tx: Tx,
  input: { organizationId: string; kind: AuthTokenKind; email: string; userId?: string | null; roleId?: string | null; name?: string | null; matterIds?: string[]; createdById?: string | null },
) {
  const email = input.email.trim().toLowerCase();
  const now = new Date();
  await tx.authToken.updateMany({ where: { kind: input.kind, email, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
  const raw = randomToken(32);
  const row = await tx.authToken.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      email,
      userId: input.userId ?? null,
      roleId: input.roleId ?? null,
      name: input.name ?? null,
      matterIds: input.matterIds ?? [],
      createdById: input.createdById ?? null,
      tokenHash: tokenDigest(raw),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[input.kind]),
    },
  });
  const path = input.kind === "PASSWORD_RESET" ? "/reset-password" : "/invite";
  return { id: row.id, raw, url: `${env().APP_URL}${path}#${raw}`, expiresAt: row.expiresAt };
}

const validWhere = (kind: AuthTokenKind, raw: string) => ({ kind, tokenHash: tokenDigest(raw), usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } });

/** Look up a still-valid token without consuming it (to render the form). */
export async function peekToken(kind: AuthTokenKind, raw: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(raw)) return null;
  return db.authToken.findFirst({ where: validWhere(kind, raw) });
}

/** Consume a token exactly once. Returns the row, or null if invalid/expired/used. */
export async function consumeToken(tx: Tx, kind: AuthTokenKind, raw: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(raw)) return null;
  const row = await tx.authToken.findFirst({ where: validWhere(kind, raw) });
  if (!row) return null;
  const claimed = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? row : null;
}

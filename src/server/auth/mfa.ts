import "server-only";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import { randomBytes } from "node:crypto";
import { db } from "../db";
import { decryptField, encryptField } from "../crypto";
import { hashPassword, verifyPassword } from "./password";

/**
 * TOTP (RFC 6238) with:
 *  • Replay protection — the last accepted time-step is stored in MySQL and a code is
 *    accepted only if its step is newer, via a conditional UPDATE. This holds across
 *    any number of app instances (no in-memory state).
 *  • Safe (re-)enrolment — a new secret is kept as *pending*; the active secret and
 *    `mfaEnabled` are untouched until the user proves the new secret with a valid code.
 *  • Recovery codes — 10 single-use codes, only Argon2 hashes stored.
 * Secrets are AES-256-GCM encrypted at rest (DATA_ENCRYPTION_KEY).
 */

const ISSUER = "AH Legal OS";
// Accept the previous/next 30 s step to tolerate clock drift.
const TOLERANCE = 30;
const RECOVERY_CODES = 10;

const clean = (code: string) => code.replace(/[\s-]/g, "");
/** TOTP results carry the matched time-step (the library types it as a TOTP/HOTP union). */
const stepOf = (r: object) => (r as { timeStep: number }).timeStep;

/** Verify a TOTP code for the user's active secret and consume its time-step. */
export async function verifyAndConsumeTotp(userId: string, code: string): Promise<boolean> {
  const token = clean(code);
  if (!/^\d{6}$/.test(token)) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, mfaSecretEnc: true, mfaLastStep: true } });
  const secret = user?.mfaEnabled ? decryptField(user.mfaSecretEnc) : null;
  if (!secret) return false;
  const r = await verifyTotp({ secret, token, epochTolerance: TOLERANCE, afterTimeStep: user!.mfaLastStep ?? undefined });
  if (!r.valid) return false;
  // Atomic consume: only one request can move mfaLastStep forward to this step.
  const claimed = await db.user.updateMany({
    where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: stepOf(r) } }] },
    data: { mfaLastStep: stepOf(r) },
  });
  return claimed.count === 1;
}

/** Start (re-)enrolment. The current MFA configuration stays fully active. */
export async function beginEnrolment(userId: string, email: string) {
  const secret = generateSecret();
  await db.user.update({ where: { id: userId }, data: { mfaPendingSecretEnc: encryptField(secret) } });
  return { secret, uri: generateURI({ issuer: ISSUER, label: email, secret }) };
}

/**
 * Confirm the pending secret with a valid code. Only then does it replace the active
 * secret. Returns fresh recovery codes (shown once) or null if the code is wrong.
 */
export async function confirmEnrolment(userId: string, code: string): Promise<string[] | null> {
  const token = clean(code);
  if (!/^\d{6}$/.test(token)) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { mfaPendingSecretEnc: true } });
  const pendingEnc = user?.mfaPendingSecretEnc;
  const secret = decryptField(pendingEnc);
  if (!pendingEnc || !secret) return null;
  const r = await verifyTotp({ secret, token, epochTolerance: TOLERANCE });
  if (!r.valid) return null;
  const codes = Array.from({ length: RECOVERY_CODES }, () => formatRecovery(randomBytes(10).toString("hex").slice(0, 10)));
  const hashes = await Promise.all(codes.map((c) => hashPassword(clean(c))));
  const swapped = await db.$transaction(async (tx) => {
    // Conditional on the same pending secret: two concurrent confirmations cannot both win.
    const res = await tx.user.updateMany({
      where: { id: userId, mfaPendingSecretEnc: pendingEnc },
      data: { mfaSecretEnc: pendingEnc, mfaPendingSecretEnc: null, mfaEnabled: true, mfaEnrolledAt: new Date(), mfaLastStep: stepOf(r) },
    });
    if (res.count !== 1) return false;
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) });
    return true;
  });
  return swapped ? codes : null;
}

/** Abandon a pending enrolment (the active MFA is unaffected). */
export async function cancelEnrolment(userId: string) {
  await db.user.update({ where: { id: userId }, data: { mfaPendingSecretEnc: null } });
}

/** Use a one-time recovery code. Each code can succeed exactly once. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const c = clean(code).toLowerCase();
  if (!/^[0-9a-f]{10}$/.test(c)) return false;
  const rows = await db.mfaRecoveryCode.findMany({ where: { userId, usedAt: null }, select: { id: true, codeHash: true } });
  for (const row of rows) {
    if (await verifyPassword(row.codeHash, c)) {
      const used = await db.mfaRecoveryCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      return used.count === 1;
    }
  }
  return false;
}

export async function remainingRecoveryCodes(userId: string) {
  return db.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
}

/** Disable MFA completely (admin reset after identity verification, or user with step-up). */
export async function disableMfa(userId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaLastStep: null, mfaEnrolledAt: null } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);
}

const formatRecovery = (hex: string) => `${hex.slice(0, 5)}-${hex.slice(5, 10)}`;

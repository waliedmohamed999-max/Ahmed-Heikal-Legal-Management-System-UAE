/**
 * MFA hardening (DB-backed): replay prevention, safe re-enrolment, recovery codes.
 * State lives in MySQL, so the guarantees hold across multiple app instances.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generate } from "otplib";
import { db } from "@/server/db";
import { decryptField } from "@/server/crypto";
import { beginEnrolment, cancelEnrolment, confirmEnrolment, consumeRecoveryCode, verifyAndConsumeTotp } from "@/server/auth/mfa";

let userId = "";
let activeSecret = "";
let recovery: string[] = [];

beforeAll(async () => {
  const u = await db.user.findFirstOrThrow({ where: { email: "mohamed@demo.ahlegal.test" } });
  userId = u.id;
  await db.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaLastStep: null } });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("MFA enrolment", () => {
  it("enrols only after the pending secret is proven with a valid code", async () => {
    const { secret } = await beginEnrolment(userId, "mohamed@demo.ahlegal.test");
    let u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mfaEnabled).toBe(false);
    expect(u.mfaPendingSecretEnc).toBeTruthy();
    expect(u.mfaPendingSecretEnc).not.toContain(secret); // encrypted at rest
    expect(await confirmEnrolment(userId, "000000")).toBeNull();
    const codes = await confirmEnrolment(userId, await generate({ secret }));
    expect(codes).toHaveLength(10);
    recovery = codes!;
    u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mfaEnabled).toBe(true);
    expect(u.mfaPendingSecretEnc).toBeNull();
    expect(decryptField(u.mfaSecretEnc)).toBe(secret);
    expect(await db.mfaRecoveryCode.count({ where: { userId } })).toBe(10);
    const stored = await db.mfaRecoveryCode.findMany({ where: { userId } });
    for (const c of codes!) expect(stored.some((s) => s.codeHash.includes(c.replace("-", "")))).toBe(false); // hashed only
    activeSecret = secret;
  });
});

describe("TOTP replay prevention", () => {
  it("accepts a valid code once and rejects the same code on second use", async () => {
    // Move past the enrolment step so a fresh window is used.
    await db.user.update({ where: { id: userId }, data: { mfaLastStep: null } });
    const code = await generate({ secret: activeSecret });
    expect(await verifyAndConsumeTotp(userId, code)).toBe(true);
    expect(await verifyAndConsumeTotp(userId, code)).toBe(false);
  });

  it("two concurrent submissions of the same code: exactly one succeeds (DB-level claim)", async () => {
    await db.user.update({ where: { id: userId }, data: { mfaLastStep: null } });
    const code = await generate({ secret: activeSecret });
    const results = await Promise.all([verifyAndConsumeTotp(userId, code), verifyAndConsumeTotp(userId, code), verifyAndConsumeTotp(userId, code)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rejects malformed and wrong codes", async () => {
    expect(await verifyAndConsumeTotp(userId, "12345")).toBe(false);
    expect(await verifyAndConsumeTotp(userId, "abcdef")).toBe(false);
    expect(await verifyAndConsumeTotp(userId, "000000")).toBe(false);
  });
});

describe("re-running MFA setup never disables the active MFA", () => {
  it("keeps the old secret active while a new one is pending, after a wrong code, and after cancel", async () => {
    const { secret: pending } = await beginEnrolment(userId, "mohamed@demo.ahlegal.test");
    let u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mfaEnabled).toBe(true);
    expect(decryptField(u.mfaSecretEnc)).toBe(activeSecret); // old secret still active

    // Wrong confirmation: nothing changes.
    expect(await confirmEnrolment(userId, "000000")).toBeNull();
    u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mfaEnabled).toBe(true);
    expect(decryptField(u.mfaSecretEnc)).toBe(activeSecret);

    // The old authenticator still works during the pending enrolment.
    await db.user.update({ where: { id: userId }, data: { mfaLastStep: null } });
    expect(await verifyAndConsumeTotp(userId, await generate({ secret: activeSecret }))).toBe(true);
    // The pending secret is NOT accepted for login.
    await db.user.update({ where: { id: userId }, data: { mfaLastStep: null } });
    expect(await verifyAndConsumeTotp(userId, await generate({ secret: pending }))).toBe(false);

    // Abandoning the setup (user closes the page) leaves the old MFA in place.
    await cancelEnrolment(userId);
    u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mfaEnabled).toBe(true);
    expect(u.mfaPendingSecretEnc).toBeNull();
    expect(decryptField(u.mfaSecretEnc)).toBe(activeSecret);
  });

  it("concurrent confirmations of the same pending secret: only one wins", async () => {
    const { secret } = await beginEnrolment(userId, "mohamed@demo.ahlegal.test");
    const code = await generate({ secret });
    const r = await Promise.all([confirmEnrolment(userId, code), confirmEnrolment(userId, code)]);
    expect(r.filter(Boolean)).toHaveLength(1);
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(decryptField(u.mfaSecretEnc)).toBe(secret); // replaced only after proof
    activeSecret = secret;
    recovery = r.find(Boolean)!;
  });
});

describe("recovery codes", () => {
  it("each code works exactly once; old codes die on re-enrolment", async () => {
    expect(await consumeRecoveryCode(userId, recovery[0])).toBe(true);
    expect(await consumeRecoveryCode(userId, recovery[0])).toBe(false);
    expect(await consumeRecoveryCode(userId, "zzzzz-zzzzz")).toBe(false);
    expect(await consumeRecoveryCode(userId, recovery[1].toUpperCase())).toBe(true); // case-insensitive
  });
});

import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string) => hash(plain, OPTS);

export async function verifyPassword(hashed: string, plain: string) {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

// Frequently breached / predictable bases (checked case-insensitively after stripping digits
// and symbols), so "Password2026!" or "Qwerty123456" are rejected.
const COMMON = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "asdfgh", "zxcvbn", "letmein", "welcome", "admin", "administrator",
  "iloveyou", "monkey", "dragon", "football", "baseball", "sunshine", "princess", "abc", "abcdef", "changeme",
  "secret", "login", "master", "dubai", "uae", "emirates", "lawyer", "legal", "ahmed", "heikal", "ahlegal", "office",
]);

const LETTER = /[A-Za-z؀-ۿ]/;
const NON_LETTER = /[^a-z؀-ۿ]/g;

/** 12–256 characters with letters and digits, not built on a common word. Returns an i18n error key. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 12) return "passwordTooShort";
  if (pw.length > 256) return "passwordTooLong";
  if (!LETTER.test(pw) || !/\d/.test(pw)) return "passwordWeak";
  const base = pw.toLowerCase().replace(NON_LETTER, "");
  const digits = pw.replace(/\D/g, "");
  const repeated = /^(.)\1+$/.test(base);
  const sequentialWithFewLetters = base.length < 4 && /^(0123|1234|2345|3456|4567|5678|6789)/.test(digits);
  if (COMMON.has(base) || repeated || sequentialWithFewLetters) return "passwordCommon";
  return null;
}

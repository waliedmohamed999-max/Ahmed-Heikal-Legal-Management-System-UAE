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

/** Minimum policy: 12+ characters containing letters and digits. Returns an i18n error key. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 12) return "passwordTooShort";
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d/.test(pw)) return "passwordWeak";
  return null;
}

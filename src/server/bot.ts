import "server-only";
import { hmac, safeEqual } from "./crypto";
import { env } from "./env";

/**
 * Public-form bot protection, layered and invisible by default:
 *  1. Honeypot field (in the form schema).
 *  2. Signed form stamp: the server signs the render time; a submission faster than
 *     MIN_FILL_MS (bots) or older than MAX_AGE_MS (replayed) is rejected. It cannot be
 *     forged without FILE_SIGNING_SECRET.
 *  3. Optional challenge provider (BOT_PROTECTION=turnstile) verified server-side — off by
 *     default so real clients never see a CAPTCHA unless abuse makes it necessary.
 * Plus the per-IP rate limit in the action itself.
 */
const MIN_FILL_MS = 3_000;
const MAX_AGE_MS = 2 * 3600_000;

export function issueFormStamp(now = Date.now()) {
  const t = String(now);
  return `${t}.${hmac(env().FILE_SIGNING_SECRET, `form-stamp:${t}`)}`;
}

export function checkFormStamp(stamp: string | undefined | null, now = Date.now()): "ok" | "tooFast" | "invalid" {
  const [t, sig] = (stamp ?? "").split(".");
  if (!t || !sig || !/^\d{10,16}$/.test(t)) return "invalid";
  if (!safeEqual(hmac(env().FILE_SIGNING_SECRET, `form-stamp:${t}`), sig)) return "invalid";
  const age = now - Number(t);
  if (age < MIN_FILL_MS) return "tooFast";
  if (age > MAX_AGE_MS || age < 0) return "invalid";
  return "ok";
}

export const botProvider = () => env().BOT_PROTECTION;
export const botSiteKey = () => (env().BOT_PROTECTION === "turnstile" ? env().TURNSTILE_SITE_KEY ?? null : null);

/** Server-side challenge verification. Always true when no provider is configured. */
export async function verifyBotToken(token: string | undefined | null, ip: string | null): Promise<boolean> {
  if (env().BOT_PROTECTION !== "turnstile") return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY!, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false; // fail closed when a provider is configured
  }
}

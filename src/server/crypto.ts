import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function key(): Buffer {
  const k = Buffer.from(env().DATA_ENCRYPTION_KEY, "base64");
  if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to 32 bytes");
  return k;
}

/** AES-256-GCM field encryption. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(enc: string | null | undefined): string | null {
  if (!enc) return null;
  const [v, iv, tag, ct] = enc.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Mask a sensitive identifier for display to users without the viewSensitive permission. */
export function maskValue(v: string | null): string | null {
  if (!v) return null;
  return v.length <= 4 ? "••••" : "•••• " + v.slice(-4);
}

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function hmac(secret: string, data: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

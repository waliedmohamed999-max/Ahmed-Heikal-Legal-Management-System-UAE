/**
 * Environment configuration and validation. Deliberately free of `server-only`
 * so the web server (instrumentation), the worker and CLI scripts share it.
 *
 *  • `parseConfig(env)` validates types and cross-field rules and returns
 *    { config, errors, warnings } — it never throws, so tests can assert on it.
 *  • `loadConfig()` throws on any error (fail fast) and caches the result.
 *
 * Production rules are stricter: no demo seeding, no placeholder or reused
 * secrets, HTTPS URLs, a real object store (or an explicit acknowledgement of an
 * encrypted local volume), a malware scanner (or an explicit acknowledgement),
 * Redis for rate limits across instances, and a backup encryption key.
 */
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3100"),
  CLIENT_PORTAL_URL: optional,
  PUBLIC_HOST: optional,
  APP_HOST: optional,
  PORTAL_HOST: optional,
  PUBLIC_ORG_SLUG: z.string().default("ahmed-heikal"),
  // Number of reverse proxies in front of the app that append to X-Forwarded-For.
  // 0 = do not trust X-Forwarded-For at all (direct exposure).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  CORS_ALLOWED_ORIGINS: optional,

  DATABASE_URL: z.string().min(1, "required"),
  REDIS_URL: optional,

  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  DATA_ENCRYPTION_KEY: z.string().min(40, "must be a 32-byte base64 key"),
  FILE_SIGNING_SECRET: z.string().min(32, "must be at least 32 characters"),

  SEED_DEMO: bool,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  STORAGE_LOCAL_ENCRYPTED_VOLUME: bool,
  S3_BUCKET: optional,
  S3_REGION: optional,
  S3_ENDPOINT: optional,
  S3_FORCE_PATH_STYLE: bool,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_USE_INSTANCE_ROLE: bool,
  S3_SSE: z.enum(["AES256", "aws:kms"]).default("AES256"),
  S3_KMS_KEY_ID: optional,
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(100),

  MALWARE_SCANNER: z.enum(["none", "clamav"]).default("none"),
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  MALWARE_SCAN_NOT_CONFIGURED_ACK: bool,

  EMAIL_PROVIDER: z.enum(["none", "smtp"]).default("none"),
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: optional,

  AI_PROVIDER: z.enum(["none", "anthropic"]).default("anthropic"),
  ANTHROPIC_API_KEY: optional,
  AI_MODEL: z.string().default("claude-opus-5"),
  AI_FALLBACK_MODEL: optional,

  OCR_PROVIDER: z.enum(["none"]).default("none"),

  SMS_PROVIDER: z.enum(["none", "twilio"]).default("none"),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM: optional,
  WHATSAPP_BUSINESS_PHONE_ID: optional,
  WHATSAPP_BUSINESS_TOKEN: optional,
  WHATSAPP_TEMPLATE_NAME: optional,

  BOT_PROTECTION: z.enum(["none", "turnstile"]).default("none"),
  TURNSTILE_SITE_KEY: optional,
  TURNSTILE_SECRET_KEY: optional,

  BACKUP_ENCRYPTION_KEY: optional,
  BACKUP_DIR: z.string().default("./backups"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(35),
  BACKUP_S3_BUCKET: optional,
  BACKUP_S3_REGION: optional,
  BACKUP_S3_ENDPOINT: optional,
  BACKUP_S3_ACCESS_KEY_ID: optional,
  BACKUP_S3_SECRET_ACCESS_KEY: optional,

  MONITORING_DSN: optional,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RUN_WORKER_IN_PROCESS: optional,
  WORKER_INTERVAL_MS: z.coerce.number().int().min(5_000).default(60_000),
});

export type AppConfig = z.infer<typeof schema>;

// Values that must never be used as real secrets.
const PLACEHOLDER = /^(change[-_ ]?me|changeit|secret|password|test|dev|example|placeholder|todo|xxx+|your[-_].*|replace[-_].*)$/i;

function weakSecret(v: string | undefined): string | null {
  if (!v) return "missing";
  if (PLACEHOLDER.test(v) || /dev[-_]?only|insecure|example|changeme|placeholder/i.test(v)) return "placeholder value";
  if (new Set(v).size < 12) return "too little entropy (too few distinct characters)";
  return null;
}

function base64Key32(v: string | undefined) {
  if (!v) return false;
  try {
    return Buffer.from(v, "base64").length === 32;
  } catch {
    return false;
  }
}

export function parseConfig(env: Record<string, string | undefined>) {
  // `KEY=` (blank) in an env file means "not set", not an empty value.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      config: null,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`),
      warnings: [] as string[],
    };
  }
  const c = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = c.NODE_ENV === "production";

  if (!base64Key32(c.DATA_ENCRYPTION_KEY)) errors.push("DATA_ENCRYPTION_KEY: must decode (base64) to exactly 32 bytes");
  if (c.BACKUP_ENCRYPTION_KEY && !base64Key32(c.BACKUP_ENCRYPTION_KEY)) errors.push("BACKUP_ENCRYPTION_KEY: must decode (base64) to exactly 32 bytes");

  if (c.STORAGE_DRIVER === "s3") {
    for (const k of ["S3_BUCKET", "S3_REGION"] as const) if (!c[k]) errors.push(`${k}: required when STORAGE_DRIVER=s3`);
    if (!c.S3_USE_INSTANCE_ROLE && (!c.S3_ACCESS_KEY_ID || !c.S3_SECRET_ACCESS_KEY)) errors.push("S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY: required unless S3_USE_INSTANCE_ROLE=true");
    if (c.S3_SSE === "aws:kms" && !c.S3_KMS_KEY_ID) errors.push("S3_KMS_KEY_ID: required when S3_SSE=aws:kms");
  }
  if (c.EMAIL_PROVIDER === "smtp") for (const k of ["SMTP_HOST", "SMTP_FROM"] as const) if (!c[k]) errors.push(`${k}: required when EMAIL_PROVIDER=smtp`);
  if (c.SMS_PROVIDER === "twilio") for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"] as const) if (!c[k]) errors.push(`${k}: required when SMS_PROVIDER=twilio`);
  if (c.BOT_PROTECTION === "turnstile" && (!c.TURNSTILE_SITE_KEY || !c.TURNSTILE_SECRET_KEY)) errors.push("TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY: required when BOT_PROTECTION=turnstile");
  if ((c.WHATSAPP_BUSINESS_PHONE_ID && !c.WHATSAPP_BUSINESS_TOKEN) || (!c.WHATSAPP_BUSINESS_PHONE_ID && c.WHATSAPP_BUSINESS_TOKEN)) errors.push("WHATSAPP_BUSINESS_PHONE_ID and WHATSAPP_BUSINESS_TOKEN must be set together");

  if (prod) {
    if (c.SEED_DEMO) errors.push("SEED_DEMO: must not be true in production");
    for (const k of ["SESSION_SECRET", "DATA_ENCRYPTION_KEY", "FILE_SIGNING_SECRET"] as const) {
      const w = weakSecret(c[k]);
      if (w) errors.push(`${k}: ${w}`);
    }
    const secrets = [c.SESSION_SECRET, c.DATA_ENCRYPTION_KEY, c.FILE_SIGNING_SECRET, c.BACKUP_ENCRYPTION_KEY].filter(Boolean);
    if (new Set(secrets).size !== secrets.length) errors.push("Secrets must be distinct (SESSION_SECRET, DATA_ENCRYPTION_KEY, FILE_SIGNING_SECRET, BACKUP_ENCRYPTION_KEY)");
    if (!c.APP_URL.startsWith("https://")) errors.push("APP_URL: must use https:// in production");
    if (c.CLIENT_PORTAL_URL && !c.CLIENT_PORTAL_URL.startsWith("https://")) errors.push("CLIENT_PORTAL_URL: must use https:// in production");
    if (/localhost|127\.0\.0\.1/.test(c.APP_URL)) errors.push("APP_URL: must be the public production URL");
    if (!c.REDIS_URL) errors.push("REDIS_URL: required in production (rate limits must be shared across instances)");
    if (/ahlegal_dev_only/.test(c.DATABASE_URL)) errors.push("DATABASE_URL: uses the development password");
    if (c.STORAGE_DRIVER === "local" && !c.STORAGE_LOCAL_ENCRYPTED_VOLUME) {
      errors.push("STORAGE_DRIVER=local in production requires STORAGE_LOCAL_ENCRYPTED_VOLUME=true (acknowledging an encrypted, backed-up volume) — prefer STORAGE_DRIVER=s3");
    }
    if (c.MALWARE_SCANNER === "none" && !c.MALWARE_SCAN_NOT_CONFIGURED_ACK) {
      errors.push("MALWARE_SCANNER=none in production requires MALWARE_SCAN_NOT_CONFIGURED_ACK=true (uploads will be served as NOT_SCANNED) — prefer MALWARE_SCANNER=clamav");
    }
    if (!c.BACKUP_ENCRYPTION_KEY) errors.push("BACKUP_ENCRYPTION_KEY: required in production (backups are encrypted)");
    if (c.MALWARE_SCANNER === "none") warnings.push("Malware scanning is not configured");
    if (c.EMAIL_PROVIDER === "none") warnings.push("E-mail is not configured: password reset and invitations fall back to one-time links shown to the admin");
    if (!c.BACKUP_S3_BUCKET) warnings.push("No off-site backup bucket configured (BACKUP_S3_BUCKET)");
    if (!c.MONITORING_DSN) warnings.push("No error monitoring configured (MONITORING_DSN)");
  }
  return { config: errors.length ? null : c, errors, warnings };
}

let cached: AppConfig | undefined;

/** Validated configuration. Throws with every problem listed (fail fast). */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  if (cached) return cached;
  const r = parseConfig(env);
  if (!r.config) {
    throw new Error(`Invalid configuration — refusing to start:\n  • ${r.errors.join("\n  • ")}`);
  }
  cached = r.config;
  return cached;
}

/** For tests only. */
export function resetConfigCache() {
  cached = undefined;
}

import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3100"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DATA_ENCRYPTION_KEY: z.string().min(40, "DATA_ENCRYPTION_KEY must be a 32-byte base64 key"),
  FILE_SIGNING_SECRET: z.string().min(32),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  AI_PROVIDER: z.string().default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-5"),
  OCR_PROVIDER: z.string().default("none"),
  SMTP_HOST: z.string().optional(),
  SMS_PROVIDER: z.string().optional(),
  WHATSAPP_BUSINESS_PHONE_ID: z.string().optional(),
  WHATSAPP_BUSINESS_TOKEN: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated environment. Throws at first use if a secret is missing — never falls back to insecure defaults. */
export function env() {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

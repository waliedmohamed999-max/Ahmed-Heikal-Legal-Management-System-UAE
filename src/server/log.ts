/**
 * Structured logger with redaction. JSON lines in production (one object per
 * line, ready for any log shipper), readable lines in development.
 *
 * Never log request bodies, document text, AI prompts or client records — pass
 * identifiers instead. As a second line of defence every field is redacted:
 *  • by key: authorization, cookie, token, password, secret, api key, Emirates ID,
 *    passport, IBAN / bank / card fields, and document/prompt text fields;
 *  • by value: bearer tokens, JWTs, Emirates ID numbers, UAE IBANs, card numbers.
 *
 * Errors are optionally forwarded to a Sentry-compatible endpoint (MONITORING_DSN)
 * with the same redaction applied — client data never leaves in error reports.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /authorization|cookie|set-cookie|token|passw|secret|api[-_]?key|private[-_]?key|emirates|passport|iban|bank|card|cvv|mfa|otp|recovery|extractedtext|pagetexts|searchtext|prompt|documenttext|body$/i;

const VALUE_PATTERNS: [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]"],
  [/\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/g, "[emirates-id]"],
  [/\bAE\d{2}\s?(?:\d{4}\s?){4}\d{3}\b/gi, "[iban]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[card?]"],
  [/(postgres(?:ql)?|redis|mysql):\/\/[^\s@]*@/gi, "$1://[credentials]@"],
];

export function redactString(s: string): string {
  let out = s;
  for (const [re, rep] of VALUE_PATTERNS) out = out.replace(re, rep);
  return out.length > 2000 ? out.slice(0, 2000) + "…[truncated]" : out;
}

export function redactValue(v: unknown, depth = 0): unknown {
  if (v == null) return v;
  if (typeof v === "string") return redactString(v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Error) return { name: v.name, message: redactString(v.message), code: (v as { code?: unknown }).code };
  if (depth > 4) return "[depth]";
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redactValue(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactValue(val, depth + 1);
    }
    return out;
  }
  return String(v);
}

function threshold(): number {
  const l = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "production" ? "info" : "debug");
  return ORDER[l] ?? ORDER.info;
}

function emit(level: Level, scope: string, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const safe = fields ? (redactValue(fields) as Record<string, unknown>) : undefined;
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify({ ts: new Date().toISOString(), level, scope, msg: redactString(msg), ...safe })
      : `[${scope}] ${redactString(msg)}${safe && Object.keys(safe).length ? " " + JSON.stringify(safe) : ""}`;
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  if (level === "error") void report(scope, msg, safe);
}

export function logger(scope: string) {
  return {
    debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", scope, msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => emit("info", scope, msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", scope, msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => emit("error", scope, msg, fields),
  };
}

/** Message of an unknown thrown value, redacted, without stack or payload. */
export const errMsg = (e: unknown) => redactString(e instanceof Error ? e.message : String(e));

// ─────────────────────────── Error monitoring (optional) ───────────────────────────

/** Minimal Sentry-compatible envelope sender. No SDK, no request bodies, redacted fields only. */
async function report(scope: string, msg: string, fields?: Record<string, unknown>) {
  const dsn = process.env.MONITORING_DSN;
  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      level: "error",
      logger: scope,
      platform: "node",
      environment: process.env.NODE_ENV,
      message: { formatted: redactString(msg) },
      extra: fields,
    };
    const body = `${JSON.stringify({ event_id: eventId, dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=ahl/1.0` },
      body,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* monitoring must never break the app */
  }
}

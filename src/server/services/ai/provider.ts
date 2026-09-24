import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { StaffContext } from "../../auth/session";

/**
 * AI provider configuration — environment only, never hard-coded in business logic:
 *   AI_PROVIDER        anthropic | none
 *   AI_MODEL           primary model id
 *   AI_FALLBACK_MODEL  optional; used when the primary model is overloaded/unavailable
 *
 * Nothing is sent anywhere unless (1) a key is configured on the server, (2) an admin
 * enabled AI in Settings → AI and (3) that admin acknowledged the data-handling policy.
 * If the provider is down, AI features report "unavailable" and nothing else is affected.
 */
export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5";
export const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || null;
const PROVIDER = (process.env.AI_PROVIDER || "anthropic") as "anthropic" | "none";

export type AiSettings = {
  enabled?: boolean;
  allowDocumentProcessing?: boolean;
  /** Mask Emirates ID, passport, IBAN and card numbers in text before it leaves the office. */
  maskIdentifiers?: boolean;
  /** Admin acknowledged the provider's data handling (who, when). Required to enable. */
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
};

export function aiSettings(ctx: StaffContext): AiSettings {
  return ((ctx.org.settings as { ai?: AiSettings }).ai ?? {}) as AiSettings;
}

export function aiStatus(ctx: StaffContext) {
  const s = aiSettings(ctx);
  const acknowledged = !!s.acknowledgedAt;
  const enabled = !!s.enabled && acknowledged && PROVIDER !== "none";
  return {
    provider: PROVIDER === "none" ? "—" : "Anthropic",
    model: AI_MODEL,
    fallbackModel: AI_FALLBACK_MODEL,
    keyConfigured: PROVIDER !== "none" && !!process.env.ANTHROPIC_API_KEY,
    enabled,
    acknowledged,
    acknowledgedAt: s.acknowledgedAt ?? null,
    allowDocuments: enabled && !!s.allowDocumentProcessing,
    maskIdentifiers: s.maskIdentifiers !== false, // on unless explicitly turned off
  };
}

let client: Anthropic | null = null;
export function aiClient() {
  client ??= new Anthropic({ timeout: 10 * 60_000, maxRetries: 2 });
  return client;
}

/** Server-side refusal fallback: on a policy decline the API re-runs the request on a fallback model in the same call. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Provider-side availability problems for which trying AI_FALLBACK_MODEL makes sense. */
export function isAvailabilityError(e: unknown) {
  return e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503 || e.status === 500 || e.status === 404);
}

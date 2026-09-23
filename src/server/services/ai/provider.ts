import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { StaffContext } from "../../auth/session";

/**
 * AI provider abstraction. v1 implements Anthropic; another provider can be added
 * behind the same `aiStatus` / `client` surface. Nothing is sent anywhere unless
 * (1) a key is configured on the server and (2) an admin enabled AI in Settings.
 */
export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5";

export function aiStatus(ctx: StaffContext) {
  const s = (ctx.org.settings as { ai?: { enabled?: boolean; allowDocumentProcessing?: boolean } }).ai ?? {};
  return {
    provider: "Anthropic",
    model: AI_MODEL,
    keyConfigured: !!process.env.ANTHROPIC_API_KEY,
    enabled: !!s.enabled,
    allowDocuments: !!s.enabled && !!s.allowDocumentProcessing,
  };
}

let client: Anthropic | null = null;
export function aiClient() {
  client ??= new Anthropic({ timeout: 10 * 60_000, maxRetries: 2 });
  return client;
}

/** Server-side refusal fallback: on a policy decline the API re-runs the request on a fallback model in the same call. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

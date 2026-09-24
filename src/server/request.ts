import "server-only";
import { headers } from "next/headers";

/**
 * Client IP from X-Forwarded-For, counted from the right by the number of trusted
 * proxies (TRUSTED_PROXY_HOPS, default 1). The left-most entries are supplied by
 * the client and can be forged, so they are never trusted for rate limiting.
 */
export function clientIp(xff: string | null, realIp: string | null, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null {
  if (hops <= 0) return null;
  const chain = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = chain.length ? chain[Math.max(0, chain.length - hops)] : realIp?.trim();
  return ip && /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : null;
}

export async function requestMeta() {
  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const userAgent = h.get("user-agent")?.slice(0, 300) || null;
  return { ip, userAgent };
}

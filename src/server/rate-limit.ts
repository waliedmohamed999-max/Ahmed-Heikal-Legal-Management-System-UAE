import "server-only";
import Redis from "ioredis";

let redis: Redis | null | undefined;
function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return (redis = null);
  redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false });
  redis.on("error", () => {}); // fall back to memory when Redis is unavailable
  return redis;
}

const memory = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window limiter. Uses Redis when available so limits hold across instances. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number }> {
  const r = client();
  if (r) {
    try {
      if (r.status === "wait") await r.connect();
      const k = `rl:${key}`;
      const count = await r.incr(k);
      if (count === 1) await r.expire(k, windowSec);
      return { ok: count <= limit, remaining: Math.max(0, limit - count) };
    } catch {
      /* fall through to memory */
    }
  }
  const now = Date.now();
  const e = memory.get(key);
  if (!e || e.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, remaining: limit - 1 };
  }
  e.count++;
  return { ok: e.count <= limit, remaining: Math.max(0, limit - e.count) };
}

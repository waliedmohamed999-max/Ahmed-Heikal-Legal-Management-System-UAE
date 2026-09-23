import { Prisma } from "@prisma/client";

/** Pure audit helpers (no I/O) — redaction, diffs and canonical JSON for hashing. */
const SENSITIVE = /password|secret|token|emiratesid|passport|mfa/i;

/** Strip secrets from snapshots so the audit log never becomes a leak vector. */
export function redact(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "bigint") return v.toString();
  if (typeof v !== "object") return v;
  if (v instanceof Date) return v.toISOString();
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toString();
  if (Array.isArray(v)) return v.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(val);
  }
  return out;
}

/** Keep only keys whose values changed — before/after stay meaningful and small. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (after[k] === undefined) continue;
    const bv = JSON.stringify(redact(before[k]) ?? null);
    const av = JSON.stringify(redact(after[k]) ?? null);
    if (bv !== av) {
      b[k] = redact(before[k]);
      a[k] = redact(after[k]);
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

/** Deterministic JSON (sorted keys) — jsonb does not preserve key order, so hashes must not depend on it. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}

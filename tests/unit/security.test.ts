/**
 * Pure security checks (no database): production configuration rules, log redaction,
 * trusted-proxy IP handling, CSV formula injection, identifier masking, FULLTEXT query
 * building, Asia/Dubai time handling, and the PWA service worker's caching behaviour.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { parseConfig } from "@/server/config";
import { redactValue, redactString } from "@/server/log";
import { clientIp } from "@/server/request";
import { csvCell } from "@/lib/csv";
import { maskIdentifiers } from "@/lib/mask";
import { fulltextQuery } from "@/server/services/fulltext";
import { dayRange, fromZonedLocal, monthRange, toZonedLocalInput, zonedParts } from "@/lib/time";

const key = () => Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256)).toString("base64");
const strong = (seed: string) => `${seed}-Q7vN2kLp9xRt4WcZ8mHb3YsJ6dFg1Ae5`;

const prodBase = {
  NODE_ENV: "production",
  APP_URL: "https://app.ahmedheikal.ae",
  DATABASE_URL: "mysql://app:Secr3t-prod@db.internal:3306/ahlegal",
  REDIS_URL: "redis://redis.internal:6379",
  SESSION_SECRET: strong("session"),
  DATA_ENCRYPTION_KEY: key(),
  FILE_SIGNING_SECRET: strong("signing"),
  BACKUP_ENCRYPTION_KEY: Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 53 + 7) % 256)).toString("base64"),
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "ahlegal-docs",
  S3_REGION: "me-central-1",
  S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
  S3_SECRET_ACCESS_KEY: "example-secret",
  MALWARE_SCANNER: "clamav",
};

describe("production configuration (fail fast)", () => {
  it("accepts a complete, safe production configuration", () => {
    const r = parseConfig(prodBase);
    expect(r.errors).toEqual([]);
    expect(r.config).not.toBeNull();
  });
  it("still allows local development with minimal settings", () => {
    const r = parseConfig({ DATABASE_URL: "mysql://u:p@localhost:3307/db", SESSION_SECRET: strong("s"), DATA_ENCRYPTION_KEY: key(), FILE_SIGNING_SECRET: strong("f") });
    expect(r.errors).toEqual([]);
  });
  it("refuses SEED_DEMO=true in production", () => {
    expect(parseConfig({ ...prodBase, SEED_DEMO: "true" }).errors.join()).toMatch(/SEED_DEMO/);
  });
  it("refuses missing, placeholder, low-entropy and reused secrets", () => {
    expect(parseConfig({ ...prodBase, SESSION_SECRET: undefined }).errors.join()).toMatch(/SESSION_SECRET/);
    expect(parseConfig({ ...prodBase, SESSION_SECRET: "changeme-changeme-changeme-changeme" }).errors.join()).toMatch(/SESSION_SECRET: placeholder/);
    expect(parseConfig({ ...prodBase, FILE_SIGNING_SECRET: "a".repeat(40) }).errors.join()).toMatch(/FILE_SIGNING_SECRET: too little entropy/);
    expect(parseConfig({ ...prodBase, FILE_SIGNING_SECRET: prodBase.SESSION_SECRET }).errors.join()).toMatch(/distinct/);
    expect(parseConfig({ ...prodBase, DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64").padEnd(44, "A") }).errors.join()).toMatch(/DATA_ENCRYPTION_KEY/);
  });
  it("requires HTTPS, Redis, a backup key, and real storage / scanner unless the risk is explicitly acknowledged", () => {
    expect(parseConfig({ ...prodBase, APP_URL: "http://app.example.ae" }).errors.join()).toMatch(/https/);
    expect(parseConfig({ ...prodBase, REDIS_URL: undefined }).errors.join()).toMatch(/REDIS_URL/);
    expect(parseConfig({ ...prodBase, BACKUP_ENCRYPTION_KEY: undefined }).errors.join()).toMatch(/BACKUP_ENCRYPTION_KEY/);
    expect(parseConfig({ ...prodBase, STORAGE_DRIVER: "local" }).errors.join()).toMatch(/STORAGE_LOCAL_ENCRYPTED_VOLUME/);
    expect(parseConfig({ ...prodBase, STORAGE_DRIVER: "local", STORAGE_LOCAL_ENCRYPTED_VOLUME: "true" }).errors).toEqual([]);
    expect(parseConfig({ ...prodBase, MALWARE_SCANNER: "none" }).errors.join()).toMatch(/MALWARE_SCAN_NOT_CONFIGURED_ACK/);
    const acked = parseConfig({ ...prodBase, MALWARE_SCANNER: "none", MALWARE_SCAN_NOT_CONFIGURED_ACK: "true" });
    expect(acked.errors).toEqual([]);
    expect(acked.warnings.join()).toMatch(/Malware scanning is not configured/); // recommended, not silently ignored
  });
  it("rejects the development database password in production", () => {
    expect(parseConfig({ ...prodBase, DATABASE_URL: "mysql://ahlegal:ahlegal_dev_only@db:3306/ahlegal" }).errors.join()).toMatch(/DATABASE_URL/);
  });
  it("treats blank env lines as not set", () => {
    expect(parseConfig({ ...prodBase, SMS_PROVIDER: "", EMAIL_PROVIDER: " " }).errors).toEqual([]);
  });
});

describe("log redaction", () => {
  it("redacts sensitive keys", () => {
    const out = JSON.stringify(redactValue({
      password: "hunter2hunter2", headers: { authorization: "Bearer abc.def.ghi", cookie: "ahl_s=secret" }, apiKey: "sk-live-123", ANTHROPIC_API_KEY: "sk-ant-x",
      emiratesId: "784-1990-1234567-1", passportNo: "N1234567", iban: "AE070331234567890123456", extractedText: "full contract text", prompt: "client document",
      mfaSecretEnc: "v1.x", recoveryCode: "abcde-fghij", ok: "visible",
    }));
    for (const s of ["hunter2", "abc.def.ghi", "secret", "sk-live", "sk-ant", "784-1990", "N1234567", "AE0703", "full contract", "client document", "v1.x", "abcde"]) expect(out).not.toContain(s);
    expect(out).toContain("visible");
  });
  it("redacts sensitive values inside free text", () => {
    const s = redactString("user sent Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig12345678 with EID 784-1985-7654321-2, IBAN AE07 0331 2345 6789 0123 456, card 4111 1111 1111 1111 via mysql://root:pw@db/x");
    expect(s).not.toMatch(/eyJhbGci|784-1985|4111 1111|root:pw|0331 2345/);
  });
});

describe("trusted proxy / client IP", () => {
  it("ignores client-forged X-Forwarded-For entries (takes the one appended by our proxy)", () => {
    expect(clientIp("6.6.6.6, 7.7.7.7, 203.0.113.9", null, 1)).toBe("203.0.113.9");
    expect(clientIp("1.1.1.1, 203.0.113.9", null, 1)).toBe("203.0.113.9"); // forging a different left entry does not change the key
    expect(clientIp("6.6.6.6, 10.0.0.2, 203.0.113.9", null, 2)).toBe("10.0.0.2");
  });
  it("trusts nothing when not behind a proxy (hops = 0) and rejects junk", () => {
    expect(clientIp("6.6.6.6", "6.6.6.6", 0)).toBeNull();
    expect(clientIp("<script>", null, 1)).toBeNull();
  });
});

describe("CSV formula injection", () => {
  it("neutralises formula triggers in text", () => {
    for (const v of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "*x", "|calc", "%x", "\t=1", " =1", "＝1+1"]) expect(csvCell(v).startsWith(`"'`)).toBe(true);
    expect(csvCell("Normal text")).toBe(`"Normal text"`);
    expect(csvCell('He said "hi"')).toBe(`"He said ""hi"""`);
  });
  it("keeps real numbers numeric (negative amounts are not text)", () => {
    expect(csvCell(-250.5)).toBe("-250.5");
    expect(csvCell(12)).toBe("12");
  });
});

describe("AI identifier masking", () => {
  it("masks Emirates ID, UAE IBAN, Luhn-valid card numbers and labelled passport numbers", () => {
    const t = maskIdentifiers("EID 784-1990-1234567-1, IBAN AE070331234567890123456, card 4111111111111111, Passport No: N1234567, case AH-2026-00012");
    expect(t).not.toMatch(/784-1990-1234567|AE070331234567890123456|4111111111111111|N1234567/);
    expect(t).toContain("AH-2026-00012"); // case numbers untouched
    expect(t).toContain("4567"); // last digits kept for orientation
  });
});

describe("FULLTEXT query builder", () => {
  it("strips boolean operators and requires each word", () => {
    expect(fulltextQuery('contract -"lease" +(x) ~y')).toBe("+contract* +lease*");
    expect(fulltextQuery("عقد الإيجار")).toBe("+عقد* +الإيجار*");
    expect(fulltextQuery("ab")).toBeNull(); // below InnoDB min token size → explicit fallback
  });
});

describe("Asia/Dubai time (UTC+4, no DST)", () => {
  it("23:30 UTC is 03:30 the next day in Dubai", () => {
    const p = zonedParts(new Date("2026-03-10T23:30:00Z"));
    expect([p.day, p.hour, p.minute]).toEqual([11, 3, 30]);
  });
  it("00:30 Dubai is 20:30 UTC the previous day", () => {
    expect(fromZonedLocal("2026-03-11T00:30").toISOString()).toBe("2026-03-10T20:30:00.000Z");
  });
  it("no DST shift across the dates when other countries change clocks", () => {
    for (const d of ["2026-03-08T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z", "2026-11-01T12:00:00Z"]) expect(zonedParts(new Date(d)).hour).toBe(16);
  });
  it("day boundaries, month change and year change use Dubai midnight", () => {
    const r = dayRange(new Date("2026-01-31T21:00:00Z")); // 01:00 on 1 Feb in Dubai
    expect(r.start.toISOString()).toBe("2026-01-31T20:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-02-01T20:00:00.000Z");
    expect(toZonedLocalInput(new Date("2026-12-31T20:30:00Z"))).toBe("2027-01-01T00:30");
    const m = monthRange(2026, 11);
    expect(m.start.toISOString()).toBe("2026-11-30T20:00:00.000Z");
    expect(m.end.toISOString()).toBe("2026-12-31T20:00:00.000Z");
  });
});

describe("PWA service worker never caches private data", () => {
  it("caches only immutable static assets; API, app, portal, documents and AI pass through uncached", async () => {
    const src = readFileSync(path.resolve("public/sw.js"), "utf8");
    const listeners: Record<string, (e: unknown) => void> = {};
    const puts: string[] = [];
    const sandbox = {
      self: { addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] = fn), location: { origin: "https://app.test" }, skipWaiting: () => {}, clients: { claim: () => {} } },
      caches: { open: async () => ({ put: async (req: { url: string }) => puts.push(req.url), addAll: async () => {} }), match: async () => undefined, keys: async () => [] },
      fetch: async () => ({ ok: true, clone() { return this; } }),
      URL,
    };
    vm.runInNewContext(src, sandbox);
    const respond = async (url: string, mode = "cors") => {
      let responded = false;
      let p: Promise<unknown> | undefined;
      listeners.fetch({ request: { method: "GET", url, mode }, respondWith: (x: Promise<unknown>) => { responded = true; p = x; } });
      if (p) await p;
      await new Promise((r) => setTimeout(r, 0));
      return responded;
    };
    for (const u of ["/api/search?q=x", "/api/files/abc?sig=1", "/api/portal/files/abc", "/app/cases/1", "/portal", "/app/ai", "/app/finance"]) {
      await respond(`https://app.test${u}`);
    }
    expect(puts).toEqual([]); // nothing private was cached
    await respond("https://app.test/_next/static/chunks/main.js");
    expect(puts).toEqual(["https://app.test/_next/static/chunks/main.js"]);
    expect(await respond("https://app.test/api/notifications")).toBe(false); // passes through untouched
  });
});

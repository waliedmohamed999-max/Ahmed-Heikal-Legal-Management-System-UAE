import { describe, expect, it } from "vitest";
import { makeT, lookup } from "@/i18n/translate";
import { MESSAGES } from "@/i18n/messages";
import { computeTotals } from "@/lib/money";
import { canonical, redact, diff } from "@/server/audit-format";
import { csvCell, toCsv } from "@/lib/csv";
import { renderTemplate } from "@/lib/templates";
import { fromZonedLocal, toZonedLocalInput } from "@/lib/time";

describe("i18n", () => {
  it("Arabic and English dictionaries have identical key sets", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [p + k] : keys(v as object, `${p}${k}.`)));
    const en = keys(MESSAGES.en).sort();
    const ar = keys(MESSAGES.ar).sort();
    expect(ar.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !ar.includes(k))).toEqual([]);
  });
  it("interpolates params and simple plurals", () => {
    const t = makeT({ a: { n: "{n} {n|item|items}", hi: "Hi {name}" } });
    expect(t("a.n", { n: 1 })).toBe("1 item");
    expect(t("a.n", { n: 3 })).toBe("3 items");
    expect(t("a.hi", { name: "Sara" })).toBe("Hi Sara");
  });
  it("resolves keys that themselves contain dots", () => {
    expect(lookup({ activity: { "document.uploaded": "Uploaded" } }, "activity.document.uploaded")).toBe("Uploaded");
  });
});

describe("invoice totals (VAT)", () => {
  it("computes subtotal, discount, 5% VAT and total with half-up rounding", () => {
    const r = computeTotals([{ quantity: 2, unitPrice: 1000 }, { quantity: 1.5, unitPrice: 333.33 }], 100, 5);
    expect(r.subtotal.toString()).toBe("2500");
    expect(r.vatAmount.toString()).toBe("120");
    expect(r.total.toString()).toBe("2520");
  });
  it("never discounts below zero", () => {
    const r = computeTotals([{ quantity: 1, unitPrice: 100 }], 500, 5);
    expect(r.discount.toString()).toBe("100");
    expect(r.total.toString()).toBe("0");
  });
});

describe("audit helpers", () => {
  it("canonical JSON is independent of key order (jsonb reorders keys)", () => {
    expect(canonical({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe(canonical({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }));
  });
  it("redacts secrets recursively", () => {
    expect(redact({ name: "x", passwordHash: "h", nested: { mfaSecret: "s", emiratesId: "784" } })).toEqual({ name: "x", passwordHash: "[redacted]", nested: { mfaSecret: "[redacted]", emiratesId: "[redacted]" } });
  });
  it("diff keeps only changed keys", () => {
    expect(diff({ a: 1, b: 2 }, { a: 1, b: 3, c: undefined })).toEqual({ before: { b: 2 }, after: { b: 3 }, changed: ["b"] });
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formula injection and quotes", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
    expect(toCsv(["a"], [[1]]).startsWith("﻿")).toBe(true);
  });
});

describe("templates", () => {
  it("fills placeholders and marks missing values instead of inventing them", () => {
    const r = renderTemplate("Dear {{client.name}}, next: {{ hearing.next }} / {{matter.court}}", { "client.name": "Falcon Ridge", "hearing.next": "24 Sep" });
    expect(r.text).toBe("Dear Falcon Ridge, next: 24 Sep / [[matter.court]]");
    expect(r.missing).toEqual(["matter.court"]);
  });
});

describe("Dubai time", () => {
  it("interprets form input as Asia/Dubai (UTC+4) and round-trips", () => {
    const d = fromZonedLocal("2026-09-24T10:30", "Asia/Dubai");
    expect(d.toISOString()).toBe("2026-09-24T06:30:00.000Z");
    expect(toZonedLocalInput(d, "Asia/Dubai")).toBe("2026-09-24T10:30");
  });
});

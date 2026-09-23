import { z } from "zod";

/**
 * Court data import — heuristic suggestion extraction from text the user supplies
 * (court PDF/e-mail/CSV export). Nothing here talks to a government system, and
 * nothing is saved: suggestions are reviewed by a person, and anything applied as a
 * deadline is stored as "Needs verification".
 */
export const SUGGESTION_KINDS = ["CASE_NUMBER", "HEARING", "DEADLINE", "DATE", "DECISION", "COURT"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
export type Suggestion = { kind: SuggestionKind; value: string; date?: string; context: string };

/** Whole-word match for Arabic terms (\b does not work for Arabic script); allows the و / ف / ب / ل prefixes. */
const arWord = (words: string[]) => `(?<![\u0600-\u06FF])[وفبل]?(?:${words.join("|")})(?![\u0600-\u06FF])`;
const either = (ar: string[], en: RegExp) => new RegExp(`${arWord(ar)}|${en.source}`, "i");
const HEARING = either(["جلسة", "الجلسة", "جلسات", "تأجيل", "أجلت", "تأجلت"], /\b(?:hearing|session|adjourn(?:ed|ment)?)\b/);
const DEADLINE = either(["مهلة", "المهلة", "موعد نهائي", "آخر موعد", "خلال", "أجل", "تقديم", "إيداع"], /\b(?:deadline|within|no\s+later\s+than|due\s+(?:by|on)|submit)\b/);
const DECISION = either(["قررت", "قرر", "قرار", "القرار", "حكمت", "الحكم", "حكم"], /\b(?:decided|decision|judge?ment|ruled|ordered)\b/);
const COURT = /(محكمة|محاكم|court|tribunal|هيئة\s+التحكيم)/i;

/** Arabic-Indic and Eastern Arabic-Indic digits → ASCII. */
export function normaliseDigits(s: string) {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const pad = (n: number) => String(n).padStart(2, "0");
function validDate(y: number, m: number, d: number) {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Dates in a line: dd/mm/yyyy (UAE convention), dd-mm-yyyy, dd.mm.yyyy and ISO yyyy-mm-dd; optional hh:mm. */
export function datesIn(line: string): string[] {
  const out: string[] = [];
  const time = line.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?!\s*[\/\-.]\s*\d{4})/);
  const t = time ? `T${pad(Number(time[1]))}:${time[2]}` : "";
  for (const m of line.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const d = validDate(+m[1], +m[2], +m[3]);
    if (d) out.push(d + t);
  }
  for (const m of line.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g)) {
    const d = validDate(+m[3], +m[2], +m[1]);
    if (d) out.push(d + t);
  }
  return [...new Set(out)];
}

export function suggestFromText(raw: string, limit = 60): Suggestion[] {
  const text = normaliseDigits(raw).replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion) => {
    const key = `${s.kind}|${s.value}|${s.date ?? ""}`;
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(s);
  };
  for (const line of lines) {
    const context = line.slice(0, 240);
    // Case numbers such as 1452/2026 — only when labelled, so plain dates are not mistaken for them.
    for (const m of line.matchAll(/(?:case|claim|appeal|file|no\.?|number|رقم|الدعوى|دعوى|القضية|الطعن|الاستئناف)\s*(?:no\.?|number|رقم)?\s*[:#]?\s*(\d{1,7}\s*\/\s*\d{4}(?:\s*[؀-ۿA-Za-z]{2,12})?)/gi)) {
      push({ kind: "CASE_NUMBER", value: m[1].replace(/\s+/g, " ").trim(), context });
    }
    const dates = datesIn(line);
    const kind: SuggestionKind = HEARING.test(line) ? "HEARING" : DEADLINE.test(line) ? "DEADLINE" : DECISION.test(line) ? "DECISION" : "DATE";
    for (const d of dates) push({ kind, value: context, date: d, context });
    if (!dates.length && DECISION.test(line) && line.length > 12) push({ kind: "DECISION", value: context, context });
    if (COURT.test(line) && line.length <= 140 && !dates.length) push({ kind: "COURT", value: context, context });
  }
  return out;
}

export const courtImportTextSchema = z.object({ text: z.string().trim().min(3, "required").max(200_000), matterId: z.string().uuid().optional().or(z.literal("")) });
export const applyImportSchema = z.object({
  importId: z.string().uuid(),
  matterId: z.string().uuid("required"),
  items: z
    .array(z.object({ kind: z.enum(SUGGESTION_KINDS), title: z.string().trim().min(1).max(250), date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).optional().or(z.literal("")) }))
    .min(1, "required")
    .max(60),
});

/**
 * CSV export with spreadsheet formula-injection protection (OWASP "CSV injection").
 *  • Text cells whose first non-whitespace character is = + - @ * | % or a tab / CR / LF
 *    (including the full-width look-alikes ＝ ＋ － ＠) are prefixed with a single quote,
 *    so Excel / LibreOffice / Sheets display them as text and never evaluate them.
 *  • Real numbers (typeof number / bigint) stay numeric — a negative amount is not text.
 *  • Every cell is quoted; embedded quotes are doubled.
 */
const DANGEROUS = /^[\s]*[=+\-@*|%\t\r\n＝＋－＠]/;

export function csvCell(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "bigint") return v.toString();
  const s = v == null ? "" : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
  const safe = DANGEROUS.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** UTF-8 BOM so Excel opens Arabic text correctly; CRLF line endings. */
export function toCsv(header: string[], rows: unknown[][]) {
  return "﻿" + [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

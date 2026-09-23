/** Quote a CSV field and neutralise spreadsheet formula injection (=, +, -, @ prefixes). */
export function csvCell(v: unknown) {
  const s = v == null ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** UTF-8 BOM so Excel opens Arabic text correctly; CRLF line endings. */
export function toCsv(header: string[], rows: unknown[][]) {
  return "﻿" + [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

/**
 * Time utilities. All instants are stored in UTC; everything shown to users is
 * rendered in the office timezone (Asia/Dubai by default) with Gregorian dates,
 * and an optional Hijri (Umm al-Qura) rendering.
 */
import { TZDate } from "@date-fns/tz";

export const DEFAULT_TZ = "Asia/Dubai";
export type Locale = "ar" | "en";

const intlLocale = (l: Locale) => (l === "ar" ? "ar-AE-u-nu-latn" : "en-GB");

export function formatDate(d: Date | string | null | undefined, locale: Locale, tz = DEFAULT_TZ, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(new Date(d));
}

export function formatTime(d: Date | string | null | undefined, locale: Locale, tz = DEFAULT_TZ) {
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined, locale: Locale, tz = DEFAULT_TZ) {
  if (!d) return "";
  return `${formatDate(d, locale, tz)} · ${formatTime(d, locale, tz)}`;
}

export function formatLongDate(d: Date | string, locale: Locale, tz = DEFAULT_TZ) {
  return formatDate(d, locale, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatHijri(d: Date | string, locale: Locale, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat(`${locale === "ar" ? "ar-SA" : "en-US"}-u-ca-islamic-umalqura-nu-latn`, {
    timeZone: tz,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(d));
}

/** Calendar parts of an instant in the office timezone. */
export function zonedParts(d: Date, tz = DEFAULT_TZ) {
  const z = new TZDate(d.getTime(), tz);
  return { year: z.getFullYear(), month: z.getMonth(), day: z.getDate(), hour: z.getHours(), minute: z.getMinutes(), weekday: z.getDay() };
}

/** Interpret a wall-clock value (e.g. from <input type="datetime-local">) in the office timezone. */
export function fromZonedLocal(value: string, tz = DEFAULT_TZ): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) throw new Error("Invalid local datetime");
  const [, y, mo, d, h = "0", mi = "0"] = m;
  return new Date(new TZDate(+y, +mo - 1, +d, +h, +mi, 0, tz).getTime());
}

/** Inverse of fromZonedLocal: format an instant as "YYYY-MM-DDTHH:mm" in the office timezone. */
export function toZonedLocalInput(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "";
  const p = zonedParts(new Date(d), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Start/end of the office-local day containing `d`, as UTC instants. */
export function dayRange(d: Date, tz = DEFAULT_TZ) {
  const p = zonedParts(d, tz);
  const start = new Date(new TZDate(p.year, p.month, p.day, 0, 0, 0, tz).getTime());
  const end = new Date(new TZDate(p.year, p.month, p.day + 1, 0, 0, 0, tz).getTime());
  return { start, end };
}

/** Monday-start week range in office time. */
export function weekRange(d: Date, tz = DEFAULT_TZ) {
  const p = zonedParts(d, tz);
  const offset = (p.weekday + 6) % 7; // Monday = 0
  const start = new Date(new TZDate(p.year, p.month, p.day - offset, 0, 0, 0, tz).getTime());
  const end = new Date(new TZDate(p.year, p.month, p.day - offset + 7, 0, 0, 0, tz).getTime());
  return { start, end };
}

export function monthRange(year: number, month: number, tz = DEFAULT_TZ) {
  return {
    start: new Date(new TZDate(year, month, 1, 0, 0, 0, tz).getTime()),
    end: new Date(new TZDate(year, month + 1, 1, 0, 0, 0, tz).getTime()),
  };
}

export function addDaysZoned(d: Date, days: number, tz = DEFAULT_TZ) {
  const p = zonedParts(d, tz);
  return new Date(new TZDate(p.year, p.month, p.day + days, p.hour, p.minute, 0, tz).getTime());
}

export function relativeTime(d: Date | string, locale: Locale, now = new Date()) {
  const diffSec = Math.round((new Date(d).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(d, locale);
}

export function formatMoney(amount: number | string | { toString(): string } | null | undefined, locale: Locale, currency = "AED") {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatMinutes(min: number, locale: Locale) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return locale === "ar" ? `${h}س ${m}د` : `${h}h ${m}m`;
}

/** Calendar date (yyyy-mm-dd) in the office timezone, `days` from now — e.g. invoice issue/due dates. */
export function isoDateInDays(days = 0, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + days * 86400_000));
}

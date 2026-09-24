import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the design-system type scale (globals.css @theme --text-*),
// otherwise `text-body` is mistaken for a colour and removes `text-brand-fg` etc.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["caption", "meta", "body", "ui", "heading", "title", "display", "2xs"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Pick the localised variant of a bilingual record field. */
export function loc<T extends Record<string, unknown>>(row: T | null | undefined, field: string, locale: "ar" | "en"): string {
  if (!row) return "";
  const ar = row[`${field}Ar`] as string | null | undefined;
  const base = (row[field] ?? row[`${field}En`]) as string | null | undefined;
  return (locale === "ar" ? ar || base : base || ar) ?? "";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function formatBytes(n: number | bigint) {
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

/** Human summary of a User-Agent string: "Chrome 153 · Windows" (display only — never used for security decisions). */
export function describeUserAgent(ua: string | null | undefined): { label: string; mobile: boolean } {
  if (!ua) return { label: "—", mobile: false };
  const browser =
    /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` :
    /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` :
    /HeadlessChrome\/(\d+)/.exec(ua) ? `Headless Chrome ${/HeadlessChrome\/(\d+)/.exec(ua)![1]}` :
    /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` :
    /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+).*Safari/.exec(ua)![1]}` : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: os ? `${browser} · ${os}` : browser, mobile: /Mobile|Android|iPhone/.test(ua) };
}

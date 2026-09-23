import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

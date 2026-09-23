export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "ahl_locale";

export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
export const isLocale = (v: unknown): v is Locale => v === "ar" || v === "en";

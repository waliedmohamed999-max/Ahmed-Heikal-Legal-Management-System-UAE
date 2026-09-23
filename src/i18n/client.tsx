"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Dict, type TFn } from "./translate";
import type { Locale } from "./config";

type Ctx = { t: TFn; locale: Locale; dir: "rtl" | "ltr"; tz: string };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, dict, tz, children }: { locale: Locale; dict: Dict; tz: string; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => ({ t: makeT(dict), locale, dir: locale === "ar" ? "rtl" : "ltr", tz }), [dict, locale, tz]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

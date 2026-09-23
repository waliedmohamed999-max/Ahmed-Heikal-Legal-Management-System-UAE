import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { makeT, type Dict } from "./translate";
import { MESSAGES } from "./messages";

export const DICTS: Record<Locale, Dict> = MESSAGES;

/** Cookie wins, then Accept-Language, then the office default (Arabic). */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const c = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const al = (await headers()).get("accept-language") ?? "";
  if (/^en\b/i.test(al)) return "en";
  return DEFAULT_LOCALE;
});

export const getT = cache(async () => {
  const locale = await getLocale();
  return { t: makeT(DICTS[locale]), locale };
});

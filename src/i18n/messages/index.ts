import type { Dict } from "../translate";
import baseEn from "./en";
import baseAr from "./ar";
import { MODULES } from "./modules";

/**
 * Messages = base dictionary + per-module dictionaries. Each module file declares
 * `en` and `ar` side by side with `ar: typeof en`, so TypeScript enforces key parity.
 */
function merge(locale: "en" | "ar", base: Dict): Dict {
  return Object.assign({}, base, ...MODULES.map((m) => m[locale] as Dict));
}

export const MESSAGES: Record<"en" | "ar", Dict> = {
  en: merge("en", baseEn as unknown as Dict),
  ar: merge("ar", baseAr as unknown as Dict),
};

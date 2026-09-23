export type Dict = { [k: string]: string | Dict };
export type Params = Record<string, string | number | null | undefined>;

/** Resolves nested keys; a segment may itself contain dots (e.g. activity."document.uploaded"). */
export function lookup(dict: Dict, key: string): string | undefined {
  const parts = key.split(".");
  const walk = (node: string | Dict | undefined, i: number): string | undefined => {
    if (i === parts.length) return typeof node === "string" ? node : undefined;
    if (node == null || typeof node === "string") return undefined;
    // Prefer the longest literal key match first (keys that contain dots)
    for (let j = parts.length; j > i; j--) {
      const k = parts.slice(i, j).join(".");
      if (k in node) {
        const r = walk(node[k], j);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  };
  return walk(dict, 0);
}

/** `t("cases.count", { n: 3 })` — `{n}` placeholders; `{n|one|many}` simple plural (English). */
export function makeT(dict: Dict) {
  return function t(key: string, params?: Params): string {
    const raw = lookup(dict, key);
    if (raw === undefined) {
      if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing key: ${key}`);
      return key.split(".").pop() ?? key;
    }
    if (!params) return raw;
    return raw.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (_, name: string, one?: string, many?: string) => {
      const v = params[name];
      if (one !== undefined) return Number(v) === 1 ? one : (many ?? one);
      return v == null ? "" : String(v);
    });
  };
}

export type TFn = ReturnType<typeof makeT>;

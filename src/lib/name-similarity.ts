/** Unicode-aware trigram matching independent of database extensions. */
export function nameSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
  const left = normalize(a), right = normalize(b);
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return 1;
  const grams = (s: string) => {
    const chars = Array.from(`  ${s} `);
    return new Set(chars.slice(0, -2).map((_, i) => chars.slice(i, i + 3).join("")));
  };
  const x = grams(left), y = grams(right);
  const common = [...x].filter((g) => y.has(g)).length;
  return common / (x.size + y.size - common);
}

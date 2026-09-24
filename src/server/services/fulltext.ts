import "server-only";
import { db } from "../db";

/**
 * MySQL FULLTEXT (InnoDB) search over extracted / OCR text and titles
 * (indexes `Document_searchText_idx`, `Document_title_idx`).
 *
 * Returns candidate ids only — callers ALWAYS intersect them with `documentScope(ctx)` in the
 * same Prisma query before reading any title, snippet or metadata, so a document the user
 * may not open never contributes anything to the results.
 *
 * The boolean-mode query is built from plain words: operators are stripped, each word is
 * required and prefix-matched. Words shorter than InnoDB's minimum token size (3) are not
 * indexed; `null` tells the caller to use its explicit LIKE fallback (titles only).
 */
const FT_MIN_TOKEN = 3;

export function fulltextQuery(q: string): string | null {
  const words = q
    .normalize("NFKC")
    .replace(/[+\-<>()~*"@]/g, " ")
    .split(/\s+/)
    .filter((w) => [...w].length >= FT_MIN_TOKEN)
    .slice(0, 8);
  return words.length ? words.map((w) => `+${w}*`).join(" ") : null;
}

export async function fulltextDocumentIds(organizationId: string, q: string, limit = 200): Promise<string[] | null> {
  const ft = fulltextQuery(q);
  if (!ft) return null;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM \`Document\`
    WHERE organizationId = ${organizationId} AND deletedAt IS NULL
      AND (MATCH(searchText) AGAINST (${ft} IN BOOLEAN MODE) OR MATCH(title) AGAINST (${ft} IN BOOLEAN MODE))
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

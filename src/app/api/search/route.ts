import { staffRoute } from "@/server/api";
import { globalSearch } from "@/server/services/search";
import { readLocale } from "@/i18n/server";

export const GET = staffRoute(
  async (req, ctx) => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (q.trim().length < 2) return { cases: [], clients: [], contacts: [], documents: [], tasks: [], invoices: [] };
    return globalSearch(ctx, q, await readLocale());
  },
  { limit: 60 }, // search is the most expensive read: 60 per user per minute
);

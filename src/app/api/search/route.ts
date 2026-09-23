import { staffRoute } from "@/server/api";
import { globalSearch } from "@/server/services/search";
import { getLocale } from "@/i18n/server";

export const GET = staffRoute(
  async (req, ctx) => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (q.trim().length < 2) return { cases: [], clients: [], contacts: [], documents: [], tasks: [], invoices: [] };
    return globalSearch(ctx, q, await getLocale());
  },
  { limit: 120 },
);

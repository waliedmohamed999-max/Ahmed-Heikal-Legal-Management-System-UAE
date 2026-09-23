import Link from "next/link";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { getPublicOrg } from "@/server/services/site";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const articles = org ? await db.article.findMany({ where: { organizationId: org.id, status: "PUBLISHED", locale }, orderBy: { publishedAt: "desc" } }) : [];
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-[32px] font-semibold tracking-tight">{t("site.insightsTitle")}</h1>
      {articles.length === 0 ? <p className="mt-6 text-ink-muted">{t("site.insightsEmpty")}</p> : (
        <ul className="mt-10 divide-y divide-line border-y border-line">
          {articles.map((a) => (
            <li key={a.id}>
              <Link href={`/insights/${a.slug}`} className="block py-6 hover:bg-surface-muted/60 sm:px-2">
                <p className="text-[12.5px] text-ink-subtle">{a.category}{a.publishedAt && ` · ${formatDate(a.publishedAt, locale)}`}</p>
                <p className="mt-1 text-[19px] font-semibold text-ink">{a.title}</p>
                {a.excerpt && <p className="mt-2 text-[14.5px] text-ink-muted">{a.excerpt}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

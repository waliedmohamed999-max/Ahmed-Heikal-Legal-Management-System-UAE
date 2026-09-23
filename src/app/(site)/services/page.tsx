import Link from "next/link";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { getPublicOrg } from "@/server/services/site";

export const metadata = { title: "Legal Services" };

export default async function ServicesPage() {
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const areas = org ? await db.practiceArea.findMany({ where: { organizationId: org.id, published: true }, orderBy: { order: "asc" } }) : [];
  const L = (en: string | null, ar: string | null) => (locale === "ar" ? ar || en : en || ar) ?? "";
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-[32px] font-semibold tracking-tight">{t("site.nav.services")}</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-muted">{t("site.practiceIntro")}</p>
      <ul className="mt-10 divide-y divide-line border-y border-line">
        {areas.map((a) => (
          <li key={a.id}>
            <Link href={`/services/${a.slug}`} className="grid gap-2 py-6 hover:bg-surface-muted/60 sm:grid-cols-[1fr_2fr] sm:px-2">
              <span className="text-[18px] font-semibold text-ink">{L(a.titleEn, a.titleAr)}</span>
              <span className="text-[14.5px] leading-relaxed text-ink-muted">{L(a.summaryEn, a.summaryAr)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { getPublicOrg } from "@/server/services/site";

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const a = org ? await db.practiceArea.findFirst({ where: { organizationId: org.id, slug, published: true } }) : null;
  if (!a) notFound();
  const L = (en: string | null, ar: string | null) => (locale === "ar" ? ar || en : en || ar) ?? "";
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Link href="/services" className="text-body text-ink-subtle hover:text-ink">{t("site.nav.services")}</Link>
      <h1 className="mt-2 text-[32px] font-semibold tracking-tight">{L(a.titleEn, a.titleAr)}</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">{L(a.summaryEn, a.summaryAr)}</p>
      {L(a.bodyEn, a.bodyAr) && <div className="mt-8 whitespace-pre-line text-heading leading-8 text-ink">{L(a.bodyEn, a.bodyAr)}</div>}
      {a.bookable && <Link href={`/book?service=${a.id}`} className="mt-10 inline-flex h-11 items-center rounded-md bg-[#0e1b33] px-5 text-ui font-semibold text-white hover:bg-[#182a4b]">{t("site.bookCta")}</Link>}
    </article>
  );
}

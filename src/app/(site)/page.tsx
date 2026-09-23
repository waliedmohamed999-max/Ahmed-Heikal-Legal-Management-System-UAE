import Link from "next/link";
import { ArrowRight, ArrowLeft, Scale, ShieldCheck, CalendarClock, ChevronDown } from "lucide-react";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { getPublicOrg } from "@/server/services/site";

export default async function HomePage() {
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const [areas, faqs, articles] = org
    ? await Promise.all([
        db.practiceArea.findMany({ where: { organizationId: org.id, published: true }, orderBy: { order: "asc" } }),
        db.faq.findMany({ where: { organizationId: org.id, published: true }, orderBy: { order: "asc" } }),
        db.article.findMany({ where: { organizationId: org.id, status: "PUBLISHED", locale }, orderBy: { publishedAt: "desc" }, take: 3 }),
      ])
    : [[], [], []];
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const L = (en: string | null, ar: string | null) => (locale === "ar" ? ar || en : en || ar) ?? "";
  return (
    <>
      <section className="relative overflow-hidden bg-[#0c1424] text-white">
        <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.06]" aria-hidden>
          <defs><pattern id="hg" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0V56" fill="none" stroke="#fff" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#hg)" />
        </svg>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <p className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-[#8c95a8]">{t("site.heroEyebrow")}</p>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.15] tracking-tight sm:text-5xl">{locale === "ar" ? "المستشار أحمد هيكل" : "Ahmed Heikal"}</h1>
            <p className="mt-5 max-w-xl text-[22px] font-medium leading-snug text-[#dfe4ee] sm:text-[26px]">{t("site.heroTitle")}</p>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#a9b1c1]">{t("site.heroBody")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="inline-flex h-12 items-center gap-2 rounded-md bg-white px-6 text-[15px] font-semibold text-[#0c1424] hover:bg-white/90">{t("site.bookCta")} <Arrow className="size-4" /></Link>
              <Link href="/contact" className="inline-flex h-12 items-center rounded-md border border-white/25 px-6 text-[15px] font-medium text-white hover:bg-white/10">{t("site.contactCta")}</Link>
            </div>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
            {[[Scale, t("site.why.a"), t("site.why.aBody")], [CalendarClock, t("site.why.b"), t("site.why.bBody")], [ShieldCheck, t("site.why.c"), t("site.why.cBody")]].map(([Icon, k, v], i) => {
              const I = Icon as typeof Scale;
              return (
                <div key={i} className="bg-[#0c1424]/80 p-5">
                  <dt className="flex items-center gap-2 text-[14px] font-semibold"><I className="size-4 text-[#7189ef]" /> {k as string}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-[#a9b1c1]">{v as string}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[28px] font-semibold tracking-tight text-ink">{t("site.practiceTitle")}</h2>
            <p className="mt-1 text-[14px] text-ink-muted">{t("site.practiceIntro")}</p>
          </div>
          <Link href="/services" className="inline-flex items-center gap-1 text-[14px] font-medium text-accent hover:underline">{t("common.viewAll")} <Arrow className="size-4" /></Link>
        </div>
        <ul className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {areas.map((a, i) => (
            <li key={a.id} className="bg-surface">
              <Link href={`/services/${a.slug}`} className="group flex h-full flex-col p-6 hover:bg-surface-muted">
                <span className="font-mono text-[12px] text-ink-subtle tabular">{String(i + 1).padStart(2, "0")}</span>
                <span className="mt-6 text-[17px] font-semibold text-ink">{L(a.titleEn, a.titleAr)}</span>
                <span className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-muted">{L(a.summaryEn, a.summaryAr)}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">{t("site.readMore")} <Arrow className="size-3.5" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {articles.length > 0 && (
        <section className="border-t border-line bg-surface-muted/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-[24px] font-semibold tracking-tight">{t("site.insightsTitle")}</h2>
            <ul className="mt-6 grid gap-5 md:grid-cols-3">
              {articles.map((a) => (
                <li key={a.id}><Link href={`/insights/${a.slug}`} className="block h-full rounded-lg border border-line bg-surface p-5 hover:shadow-md"><p className="text-[12px] text-ink-subtle">{a.category}</p><p className="mt-1 text-[16px] font-semibold text-ink">{a.title}</p><p className="mt-2 line-clamp-3 text-[13.5px] text-ink-muted">{a.excerpt}</p></Link></li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-[24px] font-semibold tracking-tight">{t("site.faqTitle")}</h2>
          <div className="mt-8 divide-y divide-line rounded-lg border border-line">
            {faqs.map((f) => (
              <details key={f.id} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink">{L(f.questionEn, f.questionAr)} <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" /></summary>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{L(f.answerEn, f.answerAr)}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="bg-[#0e1b33]">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-xl text-[22px] font-semibold leading-snug text-white">{t("site.bookIntro")}</p>
          <Link href="/book" className="inline-flex h-12 items-center gap-2 rounded-md bg-white px-6 text-[15px] font-semibold text-[#0c1424] hover:bg-white/90">{t("site.bookCta")} <Arrow className="size-4" /></Link>
        </div>
      </section>
    </>
  );
}

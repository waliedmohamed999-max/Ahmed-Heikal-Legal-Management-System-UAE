import Link from "next/link";
import { ArrowRight, ArrowLeft, Scale, ShieldCheck, CalendarClock, ChevronDown, Briefcase, Building2, Users, FileSignature, Landmark, Handshake, Languages } from "lucide-react";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { getPublicOrg, getSiteSettings } from "@/server/services/site";
import { Logo } from "@/components/brand";

const AREA_ICONS = [Briefcase, Building2, Users, FileSignature, Landmark, Handshake];

export default async function HomePage() {
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const [areas, faqs, articles, settings] = org
    ? await Promise.all([
        db.practiceArea.findMany({ where: { organizationId: org.id, published: true }, orderBy: { order: "asc" } }),
        db.faq.findMany({ where: { organizationId: org.id, published: true }, orderBy: { order: "asc" } }),
        db.article.findMany({ where: { organizationId: org.id, status: "PUBLISHED", locale }, orderBy: { publishedAt: "desc" }, take: 3 }),
        getSiteSettings(org.id),
      ])
    : [[], [], [], null];
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const L = (en: string | null | undefined, ar: string | null | undefined) => (locale === "ar" ? ar || en : en || ar) ?? "";
  const about = L(settings?.about.bodyEn, settings?.about.bodyAr) || t("web.aboutFallback");
  const name = locale === "ar" ? "المستشار أحمد هيكل" : "Ahmed Heikal";
  const steps = [1, 2, 3, 4] as const;

  const section = "mx-auto max-w-6xl px-4 sm:px-6";
  const h2 = "text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]";

  return (
    <>
      {/* ── Hero: typographic, calm, no stock imagery ───────────── */}
      <section className="border-b border-line bg-canvas">
        <div className={`${section} grid gap-12 py-16 md:py-24 lg:grid-cols-[1.35fr_1fr] lg:items-center`}>
          <div>
            <p className="text-body font-medium text-ink-subtle">{t("web.position")}</p>
            <h1 className="mt-3 text-[40px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[54px]">{name}</h1>
            <p className="mt-5 max-w-xl text-[20px] leading-snug text-ink sm:text-[22px]">{t("site.heroTitle")}</p>
            <p className="mt-4 max-w-xl text-heading leading-relaxed text-ink-muted">{t("site.heroBody")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-heading font-medium text-brand-fg transition-colors hover:bg-brand-hover">{t("site.bookCta")} <Arrow className="size-4" /></Link>
              <Link href="/contact" className="inline-flex h-11 items-center rounded-md border border-line-strong bg-surface px-5 text-heading font-medium text-ink transition-colors hover:bg-surface-muted">{t("site.contactCta")}</Link>
            </div>
          </div>
          {/* Portrait area — neutral until a real portrait is provided through the CMS */}
          <figure className="mx-auto hidden w-full max-w-sm md:block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line bg-surface">
              <div className="absolute inset-0 flex items-center justify-center text-line-strong">
                <Logo size={96} className="text-ink-subtle/40" />
              </div>
              <div className="absolute inset-x-0 bottom-0 border-t border-line bg-surface/95 px-5 py-4">
                <p className="text-ui font-semibold text-ink">{name}</p>
                <p className="text-meta text-ink-muted">{t("web.position")}</p>
              </div>
            </div>
            <figcaption className="sr-only">{t("web.portrait")}</figcaption>
          </figure>
        </div>
      </section>

      {/* ── Trust / expertise ───────────────────────────────────── */}
      <section className={`${section} py-16`}>
        <h2 className="sr-only">{t("web.trustTitle")}</h2>
        <dl className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {[[Scale, t("site.why.a"), t("site.why.aBody")], [CalendarClock, t("site.why.b"), t("site.why.bBody")], [ShieldCheck, t("site.why.c"), t("site.why.cBody")]].map(([Icon, k, v], i) => {
            const I = Icon as typeof Scale;
            return (
              <div key={i}>
                <dt className="flex items-center gap-2.5 text-ui font-semibold text-ink"><I className="size-5 text-accent" strokeWidth={1.6} aria-hidden /> {k as string}</dt>
                <dd className="mt-2 text-body leading-relaxed text-ink-muted">{v as string}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      {/* ── Practice areas ─────────────────────────────────────── */}
      {areas.length > 0 && (
        <section className="border-t border-line">
          <div className={`${section} py-16`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className={h2}>{t("web.practiceTitle")}</h2>
                <p className="mt-2 max-w-xl text-heading text-ink-muted">{t("site.practiceIntro")}</p>
              </div>
              <Link href="/services" className="inline-flex items-center gap-1 text-body font-medium text-accent hover:underline">{t("common.viewAll")} <Arrow className="size-4" /></Link>
            </div>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {areas.map((a, i) => {
                const I = AREA_ICONS[i % AREA_ICONS.length];
                return (
                  <li key={a.id}>
                    <Link href={`/services/${a.slug}`} className="group flex h-full flex-col rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-muted">
                      <I className="size-5 text-ink-muted" strokeWidth={1.6} aria-hidden />
                      <span className="mt-4 text-ui font-semibold text-ink">{L(a.titleEn, a.titleAr)}</span>
                      <span className="mt-1.5 flex-1 text-body leading-relaxed text-ink-muted">{L(a.summaryEn, a.summaryAr)}</span>
                      <span className="mt-4 inline-flex items-center gap-1 text-meta font-medium text-accent">{t("site.readMore")} <Arrow className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ── About ──────────────────────────────────────────────── */}
      <section className="border-t border-line bg-canvas">
        <div className={`${section} grid gap-10 py-16 lg:grid-cols-[1fr_1.4fr]`}>
          <div>
            <h2 className={h2}>{t("web.aboutTitle")}</h2>
            <dl className="mt-6 space-y-3 text-body">
              <div className="flex items-center gap-2.5"><Languages className="size-4 text-ink-subtle" aria-hidden /><dt className="text-ink-subtle">{t("web.languages")}</dt><dd className="text-ink">{t("web.languagesValue")}</dd></div>
            </dl>
            <Link href="/about" className="mt-6 inline-flex items-center gap-1 text-body font-medium text-accent hover:underline">{t("site.readMore")} <Arrow className="size-4" /></Link>
          </div>
          <p className="whitespace-pre-line text-[16px] leading-relaxed text-ink">{about}</p>
        </div>
      </section>

      {/* ── How we work ────────────────────────────────────────── */}
      <section className={`${section} py-16`}>
        <h2 className={h2}>{t("web.howTitle")}</h2>
        <ol className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((n) => (
            <li key={n} className="border-t-2 border-ink pt-4">
              <span className="font-mono text-meta tabular text-ink-subtle">0{n}</span>
              <h3 className="mt-2 text-ui font-semibold text-ink">{t(`web.how${n}`)}</h3>
              <p className="mt-1.5 text-body leading-relaxed text-ink-muted">{t(`web.how${n}Body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Insights ───────────────────────────────────────────── */}
      {articles.length > 0 && (
        <section className="border-t border-line">
          <div className={`${section} py-16`}>
            <h2 className={h2}>{t("site.insightsTitle")}</h2>
            <ul className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              {articles.map((a) => (
                <li key={a.id}>
                  <Link href={`/insights/${a.slug}`} className="group block">
                    <p className="text-meta text-ink-subtle">{a.category}</p>
                    <p className="mt-1 text-ui font-semibold text-ink group-hover:underline">{a.title}</p>
                    <p className="mt-2 line-clamp-3 text-body text-ink-muted">{a.excerpt}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── FAQ ────────────────────────────────────────────────── */}
      {faqs.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className={h2}>{t("site.faqTitle")}</h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {faqs.map((f) => (
                <details key={f.id} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-heading font-medium text-ink">{L(f.questionEn, f.questionAr)} <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden /></summary>
                  <p className="mt-2 text-body leading-relaxed text-ink-muted">{L(f.answerEn, f.answerAr)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-canvas">
        <div className={`${section} flex flex-col items-start gap-5 py-14 md:flex-row md:items-center md:justify-between`}>
          <div>
            <p className="text-[22px] font-semibold tracking-tight text-ink">{t("web.ctaTitle")}</p>
            <p className="mt-1 text-body text-ink-muted">{t("site.bookIntro")}</p>
          </div>
          <Link href="/book" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-heading font-medium text-brand-fg transition-colors hover:bg-brand-hover">{t("site.bookCta")} <Arrow className="size-4" /></Link>
        </div>
      </section>
    </>
  );
}

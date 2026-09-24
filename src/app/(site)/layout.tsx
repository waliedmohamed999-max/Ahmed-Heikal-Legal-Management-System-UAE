import Link from "next/link";
import type { Metadata } from "next";
import { getT, getLocale, DICTS } from "@/i18n/server";
import { getPublicOrg, getSiteSettings } from "@/server/services/site";
import { Providers } from "@/components/providers";
import { Logo } from "@/components/brand";
import { LanguageToggle } from "@/components/language-toggle";
import { SiteNav } from "./site-nav";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const org = await getPublicOrg();
  const s = org ? await getSiteSettings(org.id) : null;
  const title = (locale === "ar" ? s?.seo.titleAr : s?.seo.titleEn) || (locale === "ar" ? "المستشار أحمد هيكل — استشارات قانونية" : "Ahmed Heikal — Legal Consultant, UAE");
  return {
    title: { default: title, template: `%s · ${locale === "ar" ? "المستشار أحمد هيكل" : "Ahmed Heikal Legal Consultancy"}` },
    description: (locale === "ar" ? s?.seo.descriptionAr : s?.seo.descriptionEn) || undefined,
    robots: { index: !org?.isDemo, follow: !org?.isDemo },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const s = org ? await getSiteSettings(org.id) : null;
  const nav = [
    { href: "/", label: t("site.nav.home") },
    { href: "/about", label: t("site.nav.about") },
    { href: "/services", label: t("site.nav.services") },
    { href: "/insights", label: t("site.nav.insights") },
    { href: "/contact", label: t("site.nav.contact") },
  ];
  return (
    <Providers locale={locale} dict={DICTS[locale]} tz="Asia/Dubai">
      <div className="flex min-h-dvh flex-col bg-surface">
        {s?.placeholder && <div className="bg-warning-soft px-4 py-1.5 text-center text-meta text-warning">{t("site.placeholderNotice")}</div>}
        <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 text-[#0e1b33] dark:text-white">
              <Logo size={32} />
              <span className="leading-tight">
                <span className="block text-ui font-semibold">{locale === "ar" ? "المستشار أحمد هيكل" : "Ahmed Heikal"}</span>
                <span className="block text-caption text-ink-subtle">{locale === "ar" ? "استشارات قانونية" : "Legal Consultancy"}</span>
              </span>
            </Link>
            <SiteNav items={nav} bookLabel={t("site.nav.book")} />
            <LanguageToggle locale={locale} label={t("common.switchLanguage")} ariaLabel={t("common.switchLanguageLabel")} className="hidden text-ink-muted hover:bg-surface-muted sm:inline-flex" />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5 text-ink"><Logo size={28} className="text-brand" /><span className="text-body font-semibold">{locale === "ar" ? org?.nameAr ?? org?.name : org?.name}</span></div>
              <p className="mt-3 max-w-xs text-meta leading-relaxed text-ink-subtle">{t("site.disclaimer")}</p>
            </div>
            <div className="text-body">
              <p className="font-semibold text-ink">{t("site.contactTitle")}</p>
              <ul className="mt-3 space-y-1.5 text-ink-muted">
                {s?.contact.phone && <li className="ltr-nums"><a href={`tel:${s.contact.phone}`} className="hover:text-ink">{s.contact.phone}</a></li>}
                {s?.contact.email && <li className="ltr-nums"><a href={`mailto:${s.contact.email}`} className="hover:text-ink">{s.contact.email}</a></li>}
                {(locale === "ar" ? s?.contact.addressAr : s?.contact.addressEn) && <li>{locale === "ar" ? s?.contact.addressAr : s?.contact.addressEn}</li>}
                {s?.contact.hours && <li>{t("site.hours")}: <span className="ltr-nums">{s.contact.hours}</span></li>}
              </ul>
            </div>
            <div className="text-body">
              <ul className="space-y-1.5">
                {nav.map((n) => <li key={n.href}><Link href={n.href} className="text-ink-muted hover:text-ink">{n.label}</Link></li>)}
                <li><Link href="/book" className="font-medium text-ink hover:underline">{t("site.nav.book")}</Link></li>
                <li><Link href="/portal/login" className="text-ink-muted hover:text-ink">{t("site.clientPortal")}</Link></li>
              </ul>
            </div>
          </div>
          <p className="border-t border-line px-4 py-4 text-center text-meta text-ink-subtle">© {new Date().getFullYear()} {org?.name}. {t("site.rights")}</p>
        </footer>
      </div>
    </Providers>
  );
}

import Link from "next/link";
import { getT } from "@/i18n/server";
import { getPublicOrg, getSiteSettings } from "@/server/services/site";

export const metadata = { title: "About" };

export default async function AboutPage() {
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const s = org ? await getSiteSettings(org.id) : null;
  const body = (locale === "ar" ? s?.about.bodyAr : s?.about.bodyEn) || t("site.aboutBody");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-ink-subtle">{t("site.heroEyebrow")}</p>
      <h1 className="mt-3 text-[32px] font-semibold tracking-tight">{t("site.aboutTitle")}</h1>
      <div className="mt-6 whitespace-pre-line text-[16px] leading-8 text-ink">{body}</div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[["a", "aBody"], ["b", "bBody"], ["c", "cBody"]].map(([k, b]) => (
          <div key={k} className="rounded-lg border border-line p-5"><p className="font-semibold">{t(`site.why.${k}`)}</p><p className="mt-1.5 text-[13.5px] text-ink-muted">{t(`site.why.${b}`)}</p></div>
        ))}
      </div>
      <Link href="/book" className="mt-10 inline-flex h-11 items-center rounded-md bg-[#0e1b33] px-5 text-[14px] font-semibold text-white">{t("site.bookCta")}</Link>
    </div>
  );
}

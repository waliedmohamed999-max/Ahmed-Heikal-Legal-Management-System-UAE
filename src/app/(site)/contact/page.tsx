import Link from "next/link";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { getT } from "@/i18n/server";
import { getPublicOrg, getSiteSettings } from "@/server/services/site";

export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const { t, locale } = await getT();
  const org = await getPublicOrg();
  const s = org ? await getSiteSettings(org.id) : null;
  const c = s?.contact ?? {};
  const rows = [
    c.phone && [Phone, t("site.phone"), <a key="p" href={`tel:${c.phone}`} className="ltr-nums hover:underline">{c.phone}</a>],
    c.email && [Mail, t("site.email"), <a key="e" href={`mailto:${c.email}`} className="ltr-nums hover:underline">{c.email}</a>],
    (c.addressEn || c.addressAr) && [MapPin, t("common.address"), locale === "ar" ? c.addressAr : c.addressEn],
    c.hours && [Clock, t("site.hours"), <span key="h" className="ltr-nums">{c.hours}</span>],
  ].filter(Boolean) as [typeof Phone, string, React.ReactNode][];
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight">{t("site.contactTitle")}</h1>
        <dl className="mt-8 space-y-5">
          {rows.map(([Icon, k, v]) => (
            <div key={k} className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-muted"><Icon className="size-5 text-ink-muted" /></span><div><dt className="text-meta text-ink-subtle">{k}</dt><dd className="text-heading text-ink">{v}</dd></div></div>
          ))}
        </dl>
      </div>
      <div className="rounded-lg bg-[#0c1424] p-8 text-white">
        <p className="text-[22px] font-semibold leading-snug">{t("site.bookTitle")}</p>
        <p className="mt-2 text-ui text-[#a9b1c1]">{t("site.bookIntro")}</p>
        <Link href="/book" className="mt-6 inline-flex h-11 items-center rounded-md bg-white px-5 text-ui font-semibold text-[#0c1424]">{t("site.bookCta")}</Link>
        <p className="mt-8 text-meta leading-relaxed text-[#8c95a8]">{t("site.disclaimer")}</p>
      </div>
    </div>
  );
}

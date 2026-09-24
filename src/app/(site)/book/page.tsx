import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { getPublicOrg, getSiteSettings } from "@/server/services/site";
import { headers } from "next/headers";
import { issueFormStamp, botSiteKey } from "@/server/bot";
import { BookingForm } from "./form";

export const metadata = { title: "Book Consultation" };

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { t, locale } = await getT();
  const { service } = await searchParams;
  const org = await getPublicOrg();
  const [areas, s] = org ? await Promise.all([db.practiceArea.findMany({ where: { organizationId: org.id, published: true, bookable: true }, orderBy: { order: "asc" } }), getSiteSettings(org.id)]) : [[], null];
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-[32px] font-semibold tracking-tight">{t("site.bookTitle")}</h1>
      <p className="mt-2 text-heading text-ink-muted">{t("site.bookIntro")}</p>
      <BookingForm
        preset={service ?? ""}
        formStamp={issueFormStamp()}
        botSiteKey={botSiteKey()}
        nonce={(await headers()).get("x-nonce") ?? undefined}
        slots={s?.booking ?? { slotMinutes: 60, days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 }}
        services={areas.map((a) => ({ id: a.id, label: locale === "ar" ? a.titleAr : a.titleEn }))}
      />
      <p className="mt-8 text-meta text-ink-subtle">{t("site.disclaimer")}</p>
    </div>
  );
}

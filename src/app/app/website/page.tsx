import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { getSiteSettings } from "@/server/services/site";
import { PageHeader, LinkTabs } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { CmsView } from "./view";

export const metadata = { title: "Website CMS" };
const TABS = ["areas", "articles", "faq", "testimonials", "settings"] as const;

export default async function WebsiteCmsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("cms.manage")) notFound();
  const { t } = await getT();
  const { tab: raw } = await searchParams;
  const tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as (typeof TABS)[number]) : "areas";
  const orgId = ctx.org.id;
  const [areas, articles, faqs, testimonials, settings] = await Promise.all([
    db.practiceArea.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" } }),
    db.article.findMany({ where: { organizationId: orgId }, orderBy: { updatedAt: "desc" } }),
    db.faq.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" } }),
    db.testimonial.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" } }),
    getSiteSettings(orgId),
  ]);
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("cms.title")} subtitle={t("cms.subtitle")} actions={<Button asChild variant="secondary"><Link href="/" target="_blank"><ExternalLink /> {t("cms.view")}</Link></Button>} />
      <div className="mt-5 border-b border-line"><LinkTabs active={tab} tabs={TABS.map((k) => ({ key: k, href: `/app/website?tab=${k}`, label: t(`cms.tabs.${k}`) }))} /></div>
      <CmsView
        tab={tab}
        areas={areas.map((a) => ({ ...a, summaryEn: a.summaryEn ?? "", summaryAr: a.summaryAr ?? "", bodyEn: a.bodyEn ?? "", bodyAr: a.bodyAr ?? "" }))}
        articles={articles.map((a) => ({ id: a.id, slug: a.slug, locale: a.locale as "ar" | "en", title: a.title, excerpt: a.excerpt ?? "", body: a.body, category: a.category ?? "", status: a.status as "DRAFT" | "PUBLISHED", seoTitle: a.seoTitle ?? "", seoDescription: a.seoDescription ?? "" }))}
        faqs={faqs}
        testimonials={testimonials.map((x) => ({ ...x, quoteEn: x.quoteEn ?? "", quoteAr: x.quoteAr ?? "" }))}
        settings={{
          phone: settings.contact.phone ?? "", email: settings.contact.email ?? "", addressEn: settings.contact.addressEn ?? "", addressAr: settings.contact.addressAr ?? "", hours: settings.contact.hours ?? "",
          seoTitleEn: settings.seo.titleEn ?? "", seoTitleAr: settings.seo.titleAr ?? "", seoDescriptionEn: settings.seo.descriptionEn ?? "", seoDescriptionAr: settings.seo.descriptionAr ?? "",
          aboutEn: settings.about.bodyEn ?? "", aboutAr: settings.about.bodyAr ?? "", placeholder: settings.placeholder,
        }}
      />
    </div>
  );
}

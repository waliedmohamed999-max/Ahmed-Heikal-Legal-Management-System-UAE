import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getT, getLocale } from "@/i18n/server";
import { db } from "@/server/db";
import { getPublicOrg } from "@/server/services/site";
import { formatDate } from "@/lib/time";

async function load(slug: string) {
  const org = await getPublicOrg();
  const locale = await getLocale();
  if (!org) return null;
  return (await db.article.findFirst({ where: { organizationId: org.id, slug, status: "PUBLISHED", locale } })) ?? (await db.article.findFirst({ where: { organizationId: org.id, slug, status: "PUBLISHED" } }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = await load((await params).slug);
  return a ? { title: a.seoTitle || a.title, description: a.seoDescription || a.excerpt || undefined } : {};
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getT();
  const a = await load((await params).slug);
  if (!a) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6" dir={a.locale === "ar" ? "rtl" : "ltr"}>
      <p className="text-[12.5px] text-ink-subtle">{a.category}{a.publishedAt && ` · ${formatDate(a.publishedAt, locale)}`}</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">{a.title}</h1>
      {a.excerpt && <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">{a.excerpt}</p>}
      <div className="mt-8 whitespace-pre-line text-[16px] leading-8 text-ink">{a.body}</div>
    </article>
  );
}

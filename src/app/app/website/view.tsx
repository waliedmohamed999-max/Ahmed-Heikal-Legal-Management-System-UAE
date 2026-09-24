"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Info } from "lucide-react";
import type { z } from "zod";
import { useI18n } from "@/i18n/client";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { useAction, useServerForm } from "@/components/forms";
import { areaSchema, articleSchema, faqSchema, siteSettingsSchema, testimonialSchema } from "@/lib/cms-schemas";
import { saveAreaAction, saveArticleAction, saveFaqAction, saveTestimonialAction, deleteCmsAction, saveSiteSettingsAction } from "./actions";

type Area = z.input<typeof areaSchema> & { id: string };
type Article = z.input<typeof articleSchema> & { id: string };
type Faq = z.input<typeof faqSchema> & { id: string };
type Testimonial = z.input<typeof testimonialSchema> & { id: string };

export function CmsView({ tab, areas, articles, faqs, testimonials, settings }: { tab: string; areas: Area[]; articles: Article[]; faqs: Faq[]; testimonials: Testimonial[]; settings: z.input<typeof siteSettingsSchema> }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run } = useAction();
  const [edit, setEdit] = useState<{ kind: string; row: Record<string, unknown> | null } | null>(null);
  const del = (kind: "area" | "article" | "faq" | "testimonial", id: string) => run(() => deleteCmsAction({ kind, id }), { onSuccess: () => router.refresh() });
  const Row = ({ title, sub, published, kind, row }: { title: string; sub?: string; published: boolean; kind: "area" | "article" | "faq" | "testimonial"; row: Record<string, unknown> & { id: string } }) => (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1"><p className="truncate text-body font-medium text-ink">{title}</p>{sub && <p className="truncate text-meta text-ink-subtle" dir="ltr">{sub}</p>}</div>
      <Badge tone={published ? "success" : "neutral"}>{published ? t("cms.published") : t("cms.draft")}</Badge>
      <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEdit({ kind, row })}><Pencil /></Button>
      <Button size="icon-xs" variant="danger-ghost" aria-label={t("common.delete")} onClick={() => del(kind, row.id)}><Trash2 /></Button>
    </li>
  );
  const close = () => { setEdit(null); router.refresh(); };

  return (
    <div className="mt-5">
      {tab === "areas" && (
        <Panel title={t("cms.tabs.areas")} actions={<Button size="sm" variant="primary" onClick={() => setEdit({ kind: "area", row: null })}><Plus /> {t("cms.newArea")}</Button>}>
          {areas.length === 0 ? <EmptyState compact title="—" /> : <ul className="divide-y divide-line">{areas.map((a) => <Row key={a.id} kind="area" row={a} title={locale === "ar" ? a.titleAr : a.titleEn} sub={`/services/${a.slug}`} published={!!a.published} />)}</ul>}
        </Panel>
      )}
      {tab === "articles" && (
        <Panel title={t("cms.tabs.articles")} actions={<Button size="sm" variant="primary" onClick={() => setEdit({ kind: "article", row: null })}><Plus /> {t("cms.newArticle")}</Button>}>
          {articles.length === 0 ? <EmptyState compact title="—" /> : <ul className="divide-y divide-line">{articles.map((a) => <Row key={a.id} kind="article" row={a} title={a.title} sub={`${a.locale.toUpperCase()} · /insights/${a.slug}`} published={a.status === "PUBLISHED"} />)}</ul>}
        </Panel>
      )}
      {tab === "faq" && (
        <Panel title={t("cms.tabs.faq")} actions={<Button size="sm" variant="primary" onClick={() => setEdit({ kind: "faq", row: null })}><Plus /> {t("cms.newFaq")}</Button>}>
          {faqs.length === 0 ? <EmptyState compact title="—" /> : <ul className="divide-y divide-line">{faqs.map((f) => <Row key={f.id} kind="faq" row={f} title={locale === "ar" ? f.questionAr : f.questionEn} published={!!f.published} />)}</ul>}
        </Panel>
      )}
      {tab === "testimonials" && (
        <Panel title={t("cms.tabs.testimonials")} actions={<Button size="sm" variant="primary" onClick={() => setEdit({ kind: "testimonial", row: null })}><Plus /> {t("cms.newTestimonial")}</Button>} footer={<p className="flex items-start gap-1.5 text-meta text-warning"><Info className="mt-0.5 size-3.5 shrink-0" /> {t("cms.testimonialNote")}</p>}>
          {testimonials.length === 0 ? <EmptyState compact title="—" /> : <ul className="divide-y divide-line">{testimonials.map((x) => <Row key={x.id} kind="testimonial" row={x} title={x.authorName} published={!!x.published} />)}</ul>}
        </Panel>
      )}
      {tab === "settings" && <SettingsForm initial={settings} />}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit?.kind === "area" && <AreaDialog row={edit.row as Area | null} onDone={close} />}
        {edit?.kind === "article" && <ArticleDialog row={edit.row as Article | null} onDone={close} />}
        {edit?.kind === "faq" && <FaqDialog row={edit.row as Faq | null} onDone={close} />}
        {edit?.kind === "testimonial" && <TestimonialDialog row={edit.row as Testimonial | null} onDone={close} />}
      </Dialog>
    </div>
  );
}

function AreaDialog({ row, onDone }: { row: Area | null; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({ schema: areaSchema, defaultValues: row ?? { id: "", slug: "", titleEn: "", titleAr: "", summaryEn: "", summaryAr: "", bodyEn: "", bodyAr: "", order: 0, published: false, bookable: true }, action: saveAreaAction, successMessage: t("cms.saved"), onSuccess: onDone });
  const r = form.register;
  return (
    <DialogContent title={row ? t("common.edit") : t("cms.newArea")} size="xl">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("cms.titleEn")} error={err("titleEn")} required>{(a) => <Input {...a} dir="ltr" {...r("titleEn")} />}</Field>
        <Field label={t("cms.titleAr")} error={err("titleAr")} required>{(a) => <Input {...a} dir="rtl" {...r("titleAr")} />}</Field>
        <Field label={t("cms.slug")} error={err("slug")} required>{(a) => <Input {...a} dir="ltr" className="font-mono" {...r("slug")} />}</Field>
        <Field label={t("cms.order")}>{(a) => <Input {...a} type="number" dir="ltr" {...r("order")} />}</Field>
        <Field label={t("cms.summaryEn")}>{(a) => <Textarea {...a} rows={2} dir="ltr" {...r("summaryEn")} />}</Field>
        <Field label={t("cms.summaryAr")}>{(a) => <Textarea {...a} rows={2} dir="rtl" {...r("summaryAr")} />}</Field>
        <Field label={t("cms.bodyEn")}>{(a) => <Textarea {...a} rows={6} dir="ltr" {...r("bodyEn")} />}</Field>
        <Field label={t("cms.bodyAr")}>{(a) => <Textarea {...a} rows={6} dir="rtl" {...r("bodyAr")} />}</Field>
        <Checkbox label={t("cms.published")} {...r("published")} />
        <Checkbox label={t("cms.bookable")} {...r("bookable")} />
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function ArticleDialog({ row, onDone }: { row: Article | null; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({ schema: articleSchema, defaultValues: row ?? { id: "", slug: "", locale: "ar", title: "", excerpt: "", body: "", category: "", status: "DRAFT", seoTitle: "", seoDescription: "" }, action: saveArticleAction, successMessage: t("cms.saved"), onSuccess: onDone });
  const r = form.register;
  const dir = form.watch("locale") === "ar" ? "rtl" : "ltr";
  return (
    <DialogContent title={row ? t("common.edit") : t("cms.newArticle")} size="xl">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3" noValidate>
        <Field label={t("cms.locale")}>{(a) => <Select {...a} {...r("locale")}><option value="ar">العربية</option><option value="en">English</option></Select>}</Field>
        <Field label={t("common.status")}>{(a) => <Select {...a} {...r("status")}><option value="DRAFT">{t("cms.draft")}</option><option value="PUBLISHED">{t("cms.published")}</option></Select>}</Field>
        <Field label={t("cms.category")}>{(a) => <Input {...a} {...r("category")} />}</Field>
        <Field label={t("common.title")} error={err("title")} required className="sm:col-span-2">{(a) => <Input {...a} dir={dir} {...r("title")} />}</Field>
        <Field label={t("cms.slug")} error={err("slug")} required>{(a) => <Input {...a} dir="ltr" className="font-mono" {...r("slug")} />}</Field>
        <Field label={t("cms.excerpt")} className="sm:col-span-3">{(a) => <Textarea {...a} rows={2} dir={dir} {...r("excerpt")} />}</Field>
        <Field label={t("cms.body")} error={err("body")} required className="sm:col-span-3">{(a) => <Textarea {...a} rows={12} dir={dir} {...r("body")} />}</Field>
        <Field label={t("cms.seoTitle")}>{(a) => <Input {...a} dir={dir} {...r("seoTitle")} />}</Field>
        <Field label={t("cms.seoDescription")} className="sm:col-span-2">{(a) => <Input {...a} dir={dir} {...r("seoDescription")} />}</Field>
        <DialogFooter className="sm:col-span-3"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function FaqDialog({ row, onDone }: { row: Faq | null; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({ schema: faqSchema, defaultValues: row ?? { id: "", questionEn: "", questionAr: "", answerEn: "", answerAr: "", order: 0, published: true }, action: saveFaqAction, successMessage: t("cms.saved"), onSuccess: onDone });
  const r = form.register;
  return (
    <DialogContent title={row ? t("common.edit") : t("cms.newFaq")} size="lg">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("cms.questionEn")} error={err("questionEn")} required>{(a) => <Input {...a} dir="ltr" {...r("questionEn")} />}</Field>
        <Field label={t("cms.questionAr")} error={err("questionAr")} required>{(a) => <Input {...a} dir="rtl" {...r("questionAr")} />}</Field>
        <Field label={t("cms.answerEn")} error={err("answerEn")} required>{(a) => <Textarea {...a} rows={4} dir="ltr" {...r("answerEn")} />}</Field>
        <Field label={t("cms.answerAr")} error={err("answerAr")} required>{(a) => <Textarea {...a} rows={4} dir="rtl" {...r("answerAr")} />}</Field>
        <Field label={t("cms.order")}>{(a) => <Input {...a} type="number" dir="ltr" {...r("order")} />}</Field>
        <Checkbox label={t("cms.published")} {...r("published")} className="self-end pb-2" />
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function TestimonialDialog({ row, onDone }: { row: Testimonial | null; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({ schema: testimonialSchema, defaultValues: row ?? { id: "", authorName: "", quoteEn: "", quoteAr: "", order: 0, published: false }, action: saveTestimonialAction, successMessage: t("cms.saved"), onSuccess: onDone });
  const r = form.register;
  return (
    <DialogContent title={row ? t("common.edit") : t("cms.newTestimonial")} size="lg">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("cms.author")} error={err("authorName")} required className="sm:col-span-2">{(a) => <Input {...a} {...r("authorName")} />}</Field>
        <Field label={t("cms.quoteEn")}>{(a) => <Textarea {...a} rows={3} dir="ltr" {...r("quoteEn")} />}</Field>
        <Field label={t("cms.quoteAr")}>{(a) => <Textarea {...a} rows={3} dir="rtl" {...r("quoteAr")} />}</Field>
        <Field label={t("cms.order")}>{(a) => <Input {...a} type="number" dir="ltr" {...r("order")} />}</Field>
        <Checkbox label={t("cms.published")} {...r("published")} className="self-end pb-2" />
        <p className="text-meta text-warning sm:col-span-2">{t("cms.testimonialNote")}</p>
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function SettingsForm({ initial }: { initial: z.input<typeof siteSettingsSchema> }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({ schema: siteSettingsSchema, defaultValues: initial, action: saveSiteSettingsAction, successMessage: t("cms.saved") });
  const r = form.register;
  return (
    <Panel title={t("cms.tabs.settings")}>
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
        <Field label={t("common.phone")}>{(a) => <Input {...a} dir="ltr" {...r("phone")} />}</Field>
        <Field label={t("common.email")} error={err("email")}>{(a) => <Input {...a} type="email" dir="ltr" {...r("email")} />}</Field>
        <Field label={`${t("common.address")} (EN)`}>{(a) => <Input {...a} dir="ltr" {...r("addressEn")} />}</Field>
        <Field label={`${t("common.address")} (AR)`}>{(a) => <Input {...a} dir="rtl" {...r("addressAr")} />}</Field>
        <Field label={t("site.hours")}>{(a) => <Input {...a} dir="ltr" {...r("hours")} />}</Field>
        <span />
        <Field label={`${t("cms.seoTitle")} (EN)`}>{(a) => <Input {...a} dir="ltr" {...r("seoTitleEn")} />}</Field>
        <Field label={`${t("cms.seoTitle")} (AR)`}>{(a) => <Input {...a} dir="rtl" {...r("seoTitleAr")} />}</Field>
        <Field label={`${t("cms.seoDescription")} (EN)`}>{(a) => <Textarea {...a} rows={2} dir="ltr" {...r("seoDescriptionEn")} />}</Field>
        <Field label={`${t("cms.seoDescription")} (AR)`}>{(a) => <Textarea {...a} rows={2} dir="rtl" {...r("seoDescriptionAr")} />}</Field>
        <Field label={`${t("site.aboutTitle")} (EN)`}>{(a) => <Textarea {...a} rows={6} dir="ltr" {...r("aboutEn")} />}</Field>
        <Field label={`${t("site.aboutTitle")} (AR)`}>{(a) => <Textarea {...a} rows={6} dir="rtl" {...r("aboutAr")} />}</Field>
        <Checkbox label={t("cms.placeholder")} {...r("placeholder")} className="sm:col-span-2" />
        <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></div>
      </form>
    </Panel>
  );
}

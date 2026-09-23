"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { staffAction } from "@/server/action";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/services/access";
import { AppError } from "@/server/errors";
import { areaSchema, articleSchema, faqSchema, siteSettingsSchema, testimonialSchema } from "@/lib/cms-schemas";

const done = () => { revalidatePath("/", "layout"); };
const blank = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v])) as T;

export const saveAreaAction = staffAction(areaSchema, async ({ id, ...d }, ctx) => {
  assertPermission(ctx, "cms.manage");
  const data = blank(d);
  const r = id ? await db.practiceArea.update({ where: { id, organizationId: ctx.org.id }, data }) : await db.practiceArea.create({ data: { ...data, organizationId: ctx.org.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "cms.area_saved", entityType: "PracticeArea", entityId: r.id, after: { slug: r.slug, published: r.published } });
  done();
  return { id: r.id };
});

export const saveArticleAction = staffAction(articleSchema, async ({ id, ...d }, ctx) => {
  assertPermission(ctx, "cms.manage");
  const data = { ...blank(d), publishedAt: d.status === "PUBLISHED" ? new Date() : null, authorId: ctx.user.id };
  if (id) {
    const before = await db.article.findFirst({ where: { id, organizationId: ctx.org.id } });
    if (!before) throw new AppError("notFound", 404);
    if (before.publishedAt && d.status === "PUBLISHED") data.publishedAt = before.publishedAt;
  }
  const r = id ? await db.article.update({ where: { id }, data }) : await db.article.create({ data: { ...data, organizationId: ctx.org.id } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "cms.article_saved", entityType: "Article", entityId: r.id, after: { slug: r.slug, status: r.status } });
  done();
  return { id: r.id };
});

export const saveFaqAction = staffAction(faqSchema, async ({ id, ...d }, ctx) => {
  assertPermission(ctx, "cms.manage");
  const r = id ? await db.faq.update({ where: { id, organizationId: ctx.org.id }, data: d }) : await db.faq.create({ data: { ...d, organizationId: ctx.org.id } });
  done();
  return { id: r.id };
});

export const saveTestimonialAction = staffAction(testimonialSchema, async ({ id, ...d }, ctx) => {
  assertPermission(ctx, "cms.manage");
  const data = blank(d);
  const r = id ? await db.testimonial.update({ where: { id, organizationId: ctx.org.id }, data }) : await db.testimonial.create({ data: { ...data, organizationId: ctx.org.id } });
  done();
  return { id: r.id };
});

export const deleteCmsAction = staffAction(z.object({ kind: z.enum(["area", "article", "faq", "testimonial"]), id: z.string().uuid() }), async ({ kind, id }, ctx) => {
  assertPermission(ctx, "cms.manage");
  const where = { id, organizationId: ctx.org.id };
  if (kind === "area") await db.practiceArea.deleteMany({ where });
  if (kind === "article") await db.article.deleteMany({ where });
  if (kind === "faq") await db.faq.deleteMany({ where });
  if (kind === "testimonial") await db.testimonial.deleteMany({ where });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: `cms.${kind}_deleted`, entityId: id });
  done();
  return { ok: true };
});

export const saveSiteSettingsAction = staffAction(siteSettingsSchema, async (d, ctx) => {
  assertPermission(ctx, "cms.manage");
  const put = (key: string, value: Prisma.InputJsonValue) =>
    db.siteSetting.upsert({ where: { organizationId_key: { organizationId: ctx.org.id, key } }, update: { value }, create: { organizationId: ctx.org.id, key, value } });
  await Promise.all([
    put("contact", { phone: d.phone, email: d.email, addressEn: d.addressEn, addressAr: d.addressAr, hours: d.hours }),
    put("seo", { titleEn: d.seoTitleEn, titleAr: d.seoTitleAr, descriptionEn: d.seoDescriptionEn, descriptionAr: d.seoDescriptionAr }),
    put("about", { bodyEn: d.aboutEn, bodyAr: d.aboutAr }),
    put("placeholder", { active: d.placeholder }),
  ]);
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "cms.settings_saved" });
  done();
  return { ok: true };
});

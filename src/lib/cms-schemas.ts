import { z } from "zod";

const s = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid").max(80);

export const areaSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), slug, titleEn: z.string().trim().min(1, "required").max(160), titleAr: z.string().trim().min(1, "required").max(160), summaryEn: s(600), summaryAr: s(600), bodyEn: s(20000), bodyAr: s(20000), order: z.coerce.number().int().min(0).max(999), published: z.boolean(), bookable: z.boolean() });
export const articleSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), slug, locale: z.enum(["ar", "en"]), title: z.string().trim().min(1, "required").max(200), excerpt: s(600), body: z.string().trim().min(1, "required").max(100000), category: s(80), status: z.enum(["DRAFT", "PUBLISHED"]), seoTitle: s(160), seoDescription: s(300) });
export const faqSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), questionEn: z.string().trim().min(1, "required").max(300), questionAr: z.string().trim().min(1, "required").max(300), answerEn: z.string().trim().min(1, "required").max(4000), answerAr: z.string().trim().min(1, "required").max(4000), order: z.coerce.number().int().min(0).max(999), published: z.boolean() });
export const testimonialSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), authorName: z.string().trim().min(1, "required").max(120), quoteEn: s(1000), quoteAr: s(1000), order: z.coerce.number().int().min(0).max(999), published: z.boolean() });
export const siteSettingsSchema = z.object({
  phone: s(40), email: z.string().trim().email("email").optional().or(z.literal("")), addressEn: s(300), addressAr: s(300), hours: s(120),
  seoTitleEn: s(160), seoTitleAr: s(160), seoDescriptionEn: s(300), seoDescriptionAr: s(300), aboutEn: s(20000), aboutAr: s(20000), placeholder: z.boolean(),
});

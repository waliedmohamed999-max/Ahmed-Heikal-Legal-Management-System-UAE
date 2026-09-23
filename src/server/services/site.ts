import "server-only";
import { cache } from "react";
import { db } from "../db";

/** The public website serves one organisation (v1). Multi-tenant later via host → org mapping. */
export const getPublicOrg = cache(async () => {
  const slug = process.env.PUBLIC_ORG_SLUG ?? "ahmed-heikal";
  return db.organization.findUnique({ where: { slug }, select: { id: true, name: true, nameAr: true, phone: true, email: true, address: true, isDemo: true } });
});

export const getSiteSettings = cache(async (orgId: string) => {
  const rows = await db.siteSetting.findMany({ where: { organizationId: orgId } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, Record<string, unknown>>;
  return {
    contact: (map.contact ?? {}) as { phone?: string; email?: string; addressEn?: string; addressAr?: string; hours?: string; mapUrl?: string },
    seo: (map.seo ?? {}) as { titleEn?: string; titleAr?: string; descriptionEn?: string; descriptionAr?: string },
    about: (map.about ?? {}) as { bodyEn?: string; bodyAr?: string },
    placeholder: !!(map.placeholder as { active?: boolean } | undefined)?.active,
    booking: (map.booking ?? { slotMinutes: 60, days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 }) as { slotMinutes: number; days: number[]; startHour: number; endHour: number },
  };
});

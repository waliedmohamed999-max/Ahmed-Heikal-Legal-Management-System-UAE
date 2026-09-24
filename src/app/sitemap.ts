import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/server/db";
import { getPublicOrg } from "@/server/services/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Published content requires the runtime database, not a build-time connection.
  await connection();
  const base = process.env.APP_URL ?? "http://localhost:3100";
  const org = await getPublicOrg();
  if (!org || org.isDemo) return [];
  const [areas, articles] = await Promise.all([
    db.practiceArea.findMany({ where: { organizationId: org.id, published: true }, select: { slug: true, updatedAt: true } }),
    db.article.findMany({ where: { organizationId: org.id, status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    ...["", "/about", "/services", "/insights", "/contact", "/book"].map((p) => ({ url: `${base}${p}` })),
    ...areas.map((a) => ({ url: `${base}/services/${a.slug}`, lastModified: a.updatedAt })),
    ...articles.map((a) => ({ url: `${base}/insights/${a.slug}`, lastModified: a.updatedAt })),
  ];
}

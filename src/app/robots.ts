import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/portal", "/api", "/login", "/print"] }],
    sitemap: `${process.env.APP_URL ?? "http://localhost:3100"}/sitemap.xml`,
  };
}

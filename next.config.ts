import type { NextConfig } from "next";

/**
 * Security headers. The page Content-Security-Policy (with a per-request nonce) is set in
 * src/proxy.ts; the static offline page gets a strict no-script policy here, and file
 * downloads set their own (sandboxed, frame-ancestors 'self') policy in the route.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Minimal self-contained server bundle for the production Docker image.
  output: "standalone",
  // Next 16.3's standalone trace omits the route-handler runtime; without it every `app/api/**` route
  // fails in the production image (found by the Phase 11 Docker test). Include it explicitly.
  outputFileTracingIncludes: {
    "*": ["node_modules/next/dist/compiled/next-server/app-route*.runtime.prod.js"],
  },
  // Never trace secrets, data, tests or docs into the server output (defence in depth).
  outputFileTracingExcludes: {
    "*": [".env", ".env.*", "backups/**", "backups-test/**", "storage/**", "storage-test/**", "tests/**", "test-results/**", "docs/**", "dist/**", "prisma/legacy-postgresql-migrations/**", "scripts/**", "src/**"],
  },
  serverExternalPackages: ["@node-rs/argon2", "pdf-parse", "mammoth"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      // File previews set their own SAMEORIGIN framing policy so PDFs can render in-app.
      { source: "/((?!api/files).*)", headers: securityHeaders },
      { source: "/api/files/:path*", headers: securityHeaders.filter((h) => h.key !== "X-Frame-Options") },
      { source: "/offline.html", headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" }] },
      // Health probes and APIs are never cached by intermediaries.
      { source: "/health/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pg-boss", "pdf-parse", "mammoth"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      // File previews set their own SAMEORIGIN framing policy so PDFs can render in-app.
      { source: "/((?!api/files).*)", headers: securityHeaders },
      { source: "/api/files/:path*", headers: securityHeaders.filter((h) => h.key !== "X-Frame-Options") },
    ];
  },
};

export default nextConfig;

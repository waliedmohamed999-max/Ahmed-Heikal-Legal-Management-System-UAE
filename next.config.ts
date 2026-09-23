import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
// Everything is served from our own origin (fonts are self-hosted by next/font). Next's inline
// bootstrap scripts need 'unsafe-inline'; dev tooling additionally needs eval and websockets.
const csp = (frameAncestors: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp("'none'") },
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
      {
        source: "/api/files/:path*",
        headers: [
          ...securityHeaders.filter((h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy"),
          { key: "Content-Security-Policy", value: csp("'self'") },
        ],
      },
    ];
  },
};

export default nextConfig;

import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard, host routing and security headers.
 *  • Content-Security-Policy with a fresh nonce per request: scripts run only with the
 *    nonce ('strict-dynamic'), no 'unsafe-inline' / 'unsafe-eval' for scripts in
 *    production. Styles keep 'unsafe-inline' (React/Radix set inline style attributes,
 *    which nonces cannot cover) — documented, lower-risk exception.
 *  • Cross-origin protection: state-changing API requests must come from our own origin
 *    (or CORS_ALLOWED_ORIGINS). No wildcard CORS, never with credentials.
 *  • Cheap cookie-presence gate for /app and /portal (full session validation happens
 *    server-side in requireStaff / requireClient on every request).
 *  • Optional host split: APP_HOST → /app, PORTAL_HOST → /portal, PUBLIC_HOST → site.
 */
const dev = process.env.NODE_ENV !== "production";
const PUBLIC_PATHS = ["/login", "/reset-password", "/invite", "/api", "/_next", "/health"];

function csp(nonce: string) {
  const turnstile = process.env.BOT_PROTECTION === "turnstile" ? " https://challenges.cloudflare.com" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}${turnstile}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    `frame-src 'self' blob:${turnstile}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function allowedOrigin(req: NextRequest, origin: string) {
  const allow = (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const o = new URL(origin);
    return o.host === req.headers.get("host") || allow.includes(o.origin);
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Health probes are host-independent and never rewritten or gated.
  if (pathname === "/health" || pathname.startsWith("/health/")) return NextResponse.next();

  // Reject cross-site state-changing API calls (defence in depth on top of SameSite cookies;
  // Server Actions additionally have Next's own origin check).
  if (pathname.startsWith("/api/") && !["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && !allowedOrigin(req, origin)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const host = req.headers.get("host")?.split(":")[0];
  if (host && process.env.APP_HOST && host === process.env.APP_HOST && !pathname.startsWith("/app") && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.rewrite(new URL(`/app${pathname === "/" ? "" : pathname}${search}`, req.url));
  }
  if (host && process.env.PORTAL_HOST && host === process.env.PORTAL_HOST && !pathname.startsWith("/portal") && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.rewrite(new URL(`/portal${pathname === "/" ? "" : pathname}${search}`, req.url));
  }

  if (pathname.startsWith("/app") && !req.cookies.get("ahl_s")) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/portal") && !pathname.startsWith("/portal/login") && !req.cookies.get("ahl_p")) {
    return NextResponse.redirect(new URL("/portal/login", req.url));
  }

  // API responses and file downloads set their own headers; pages get the nonce CSP.
  if (pathname.startsWith("/api/")) return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", policy);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

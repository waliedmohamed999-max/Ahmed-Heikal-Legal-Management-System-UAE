import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard + host routing.
 *  • Cheap cookie-presence gate for /app and /portal (full session validation
 *    happens server-side in requireStaff / requireClient on every request).
 *  • Optional host split: APP_HOST → /app, PORTAL_HOST → /portal, PUBLIC_HOST → site.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = req.headers.get("host")?.split(":")[0];

  if (host && process.env.APP_HOST && host === process.env.APP_HOST && !pathname.startsWith("/app") && !pathname.startsWith("/login") && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
    return NextResponse.rewrite(new URL(`/app${pathname === "/" ? "" : pathname}${search}`, req.url));
  }
  if (host && process.env.PORTAL_HOST && host === process.env.PORTAL_HOST && !pathname.startsWith("/portal") && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)"],
};

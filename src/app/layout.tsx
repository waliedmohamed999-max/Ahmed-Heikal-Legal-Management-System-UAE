import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { getLocale } from "@/i18n/server";
import { dirOf } from "@/i18n/config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "AH Legal OS", template: "%s · AH Legal OS" },
  description: "Legal Practice Management & Case Intelligence Platform — Ahmed Heikal Legal Consultancy, UAE.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0c1424" },
    { media: "(prefers-color-scheme: dark)", color: "#070b12" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Theme is a non-sensitive display preference kept in a cookie, so it renders server-side (no flash, no inline script).
  const dark = (await cookies()).get("ahl_theme")?.value === "dark";
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${inter.variable} ${arabic.variable}${dark ? " dark" : ""}`} suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

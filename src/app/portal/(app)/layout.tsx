import { LogOut, ShieldCheck } from "lucide-react";
import { requireClient } from "@/server/auth/session";
import { getT, DICTS } from "@/i18n/server";
import { Providers } from "@/components/providers";
import { Logo } from "@/components/brand";
import { LanguageToggle } from "@/components/language-toggle";
import { portalLogoutAction } from "@/app/(auth)/actions";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClient();
  const { t, locale } = await getT();
  return (
    <Providers locale={locale} dict={DICTS[locale]} tz={ctx.org.timezone}>
      <div className="min-h-dvh bg-canvas">
        <header className="border-b border-line bg-nav text-nav-fg">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
            <Logo className="text-white" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13.5px] font-semibold text-white">{t("portal.title")}</p>
              <p className="truncate text-[11px] text-nav-muted">{t("app.office")}</p>
            </div>
            <div className="ms-auto flex items-center gap-1">
              <LanguageToggle locale={locale} label={t("common.switchLanguage")} ariaLabel={t("common.switchLanguageLabel")} className="text-nav-fg hover:bg-nav-surface" />
              <form action={portalLogoutAction}>
                <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-nav-fg hover:bg-nav-surface"><LogOut className="size-4" /> <span className="hidden sm:inline">{t("portal.signOut")}</span></button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto flex max-w-5xl items-center gap-1.5 px-4 pb-8 text-[11.5px] text-ink-subtle"><ShieldCheck className="size-3.5" /> {t("portal.secure")}</footer>
      </div>
    </Providers>
  );
}

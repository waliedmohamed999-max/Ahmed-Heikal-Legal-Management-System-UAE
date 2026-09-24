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
      <div className="min-h-dvh bg-surface">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
            <Logo size={28} className="text-brand" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-body font-semibold text-ink">{t("app.office")}</p>
              <p className="truncate text-caption text-ink-subtle">{t("portal.title")}</p>
            </div>
            <div className="ms-auto flex items-center gap-1">
              <LanguageToggle locale={locale} label={t("common.switchLanguage")} ariaLabel={t("common.switchLanguageLabel")} className="text-ink-muted hover:bg-surface-muted hover:text-ink" />
              <form action={portalLogoutAction}>
                <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-body text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"><LogOut className="size-4" /> <span className="hidden sm:inline">{t("portal.signOut")}</span></button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="mx-auto flex max-w-4xl items-center gap-1.5 px-4 pb-10 text-meta text-ink-subtle sm:px-6"><ShieldCheck className="size-3.5" aria-hidden /> {t("portal.secure")}</footer>
      </div>
    </Providers>
  );
}

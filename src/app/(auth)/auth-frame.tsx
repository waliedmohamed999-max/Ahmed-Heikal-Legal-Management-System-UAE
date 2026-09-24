import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand";
import { LanguageToggle } from "@/components/language-toggle";
import { getT } from "@/i18n/server";

/** Shared frame for staff login, MFA and client-portal login — one calm, centred column. */
export async function AuthFrame({ title, subtitle, children, variant = "staff" }: { title: string; subtitle: string; children: React.ReactNode; variant?: "staff" | "portal" }) {
  const { t, locale } = await getT();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="flex items-center justify-end p-4 sm:p-6">
        <LanguageToggle locale={locale} label={t("common.switchLanguage")} ariaLabel={t("common.switchLanguageLabel")} className="text-ink-muted hover:bg-surface-sunken hover:text-ink" />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[6vh] sm:px-6">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center gap-2.5">
            <Logo size={32} className="text-brand" />
            <div className="leading-tight">
              <div className="text-body font-semibold text-ink">{variant === "portal" ? t("app.office") : "AH Legal OS"}</div>
              <div className="text-meta text-ink-subtle">{variant === "portal" ? t("auth.portalTitle") : t("app.office")}</div>
            </div>
          </div>
          <div className="mt-8 rounded-xl border border-line bg-surface p-6 sm:p-7">
            <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
            <p className="mb-6 mt-1 text-body text-ink-muted">{subtitle}</p>
            {children}
          </div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-meta text-ink-subtle">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t("auth.securityNote")}
          </p>
        </div>
      </main>
    </div>
  );
}

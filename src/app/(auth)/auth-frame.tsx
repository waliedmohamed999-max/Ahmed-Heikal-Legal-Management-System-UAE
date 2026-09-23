import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand";
import { LanguageToggle } from "@/components/language-toggle";
import { getT } from "@/i18n/server";

/** Shared split-screen frame for staff login, MFA and client-portal login. */
export async function AuthFrame({ title, subtitle, children, variant = "staff" }: { title: string; subtitle: string; children: React.ReactNode; variant?: "staff" | "portal" }) {
  const { t, locale } = await getT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-nav text-nav-fg lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Quiet architectural grid — structure, not decoration */}
        <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.07]" aria-hidden>
          <defs>
            <pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)" />
        </svg>
        <div className="relative flex items-center gap-3 text-white">
          <Logo size={34} />
          <div>
            <div className="text-[15px] font-semibold tracking-tight">AH Legal OS</div>
            <div className="text-xs text-nav-muted">{t("app.office")}</div>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="text-[28px] font-semibold leading-snug tracking-tight text-white">
            {variant === "portal" ? t("auth.portalTitle") : t("app.tagline")}
          </p>
          <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-nav-line bg-nav-line text-[12px]">
            {(["nav.cases", "nav.hearings", "nav.documents"] as const).map((k) => (
              <div key={k} className="bg-nav-surface px-3 py-3 text-nav-muted">
                <div className="mb-2 h-1 w-6 rounded-full bg-[var(--accent)]" />
                {t(k)}
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-nav-muted">
          <ShieldCheck className="size-4" aria-hidden />
          {t("auth.securityNote")}
        </div>
      </aside>

      <main className="flex flex-col bg-surface">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="flex items-center gap-2 text-ink lg:invisible">
            <Logo />
            <span className="text-sm font-semibold">AH Legal OS</span>
          </div>
          <LanguageToggle locale={locale} label={t("common.switchLanguage")} ariaLabel={t("common.switchLanguageLabel")} className="text-ink-muted hover:bg-surface-muted hover:text-ink" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          <div className="w-full max-w-[380px]">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            <p className="mb-8 mt-1.5 text-sm text-ink-muted">{subtitle}</p>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

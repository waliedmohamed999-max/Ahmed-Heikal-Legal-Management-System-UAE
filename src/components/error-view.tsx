"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Friendly error screen used by every error boundary. Never shows the message or stack:
 * server errors reach the client only as an opaque digest, which support can match to
 * the server log. Bilingual from <html lang>, because boundaries can render outside the
 * i18n provider.
 */
const TEXT = {
  en: { title: "Something went wrong", body: "This part of the page could not be loaded. Your data is safe. Try again, or go back to the dashboard.", retry: "Try again", home: "Back to dashboard", ref: "Reference" },
  ar: { title: "حدث خطأ غير متوقع", body: "تعذّر تحميل هذا الجزء من الصفحة. بياناتك محفوظة. أعد المحاولة أو عُد إلى لوحة التحكم.", retry: "إعادة المحاولة", home: "العودة للوحة التحكم", ref: "رقم المرجع" },
};

const subscribe = () => () => {};
const getLang = () => (document.documentElement.lang === "en" ? "en" : "ar");

export function ErrorView({ error, retry, homeHref = "/app", compact }: { error: Error & { digest?: string }; retry?: () => void; homeHref?: string; compact?: boolean }) {
  const lang = useSyncExternalStore(subscribe, getLang, () => "ar" as const);
  const t = TEXT[lang];
  return (
    <div role="alert" className={compact ? "px-4 py-10" : "flex min-h-[60vh] items-center justify-center px-4 py-16"}>
      <div className="mx-auto max-w-md text-center">
        <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden />
        <h1 className="mt-4 text-title font-semibold text-ink">{t.title}</h1>
        <p className="mt-2 text-body text-ink-muted">{t.body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {retry && (
            <button type="button" onClick={() => retry()} className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-body font-medium text-brand-fg hover:bg-brand-hover">
              <RotateCcw className="size-4" aria-hidden /> {t.retry}
            </button>
          )}
          <a href={homeHref} className="inline-flex h-9 items-center rounded-md border border-line-strong px-4 text-body font-medium text-ink hover:bg-surface-muted">{t.home}</a>
        </div>
        {error.digest && <p className="mt-6 font-mono text-caption text-ink-subtle" dir="ltr">{t.ref}: {error.digest}</p>}
      </div>
    </div>
  );
}

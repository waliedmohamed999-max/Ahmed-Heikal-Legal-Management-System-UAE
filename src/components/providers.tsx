"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlay";
import { I18nProvider } from "@/i18n/client";
import type { Dict } from "@/i18n/translate";

export function Providers({ locale, dict, tz, children }: { locale: "ar" | "en"; dict: Dict; tz: string; children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
      }),
  );
  // PWA: static-asset + offline-page service worker (production only; never caches client data).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider locale={locale} dict={dict} tz={tz}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position={locale === "ar" ? "bottom-left" : "bottom-right"} dir={locale === "ar" ? "rtl" : "ltr"} richColors closeButton toastOptions={{ className: "text-body" }} />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

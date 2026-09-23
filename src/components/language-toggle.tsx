"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocaleAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export function LanguageToggle({ locale, label, ariaLabel, className }: { locale: "ar" | "en"; label: string; ariaLabel: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setLocaleAction(locale === "ar" ? "en" : "ar");
          router.refresh();
        })
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors disabled:opacity-60",
        className,
      )}
    >
      <Languages className="size-4" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { alertLevel, countdown, type AlertLevel, type AlertThreshold } from "@/lib/deadline";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

const LEVEL_TEXT: Record<AlertLevel, string> = {
  OVERDUE: "text-danger",
  IMMEDIATE: "text-critical",
  CRITICAL: "text-critical",
  HIGH: "text-high",
  PRIORITY: "text-warning",
  REMINDER: "text-info",
  NONE: "text-ink",
};

/**
 * Shared ticking clock. `fast` forces 1s resolution; passing a target time switches to
 * 1s automatically within the last hour before it (30s otherwise).
 */
export function useNow(fastOrTarget: boolean | number = false) {
  const [now, setNow] = useState(() => Date.now());
  const fast = typeof fastOrTarget === "number" ? fastOrTarget - now < 3600_000 : fastOrTarget;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), fast ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [fast]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Large DD · HH · MM countdown blocks (Next Hearing widget, hearing pages). */
export function CountdownBlocks({ target, thresholds, className, dark }: { target: string; thresholds?: AlertThreshold[]; className?: string; dark?: boolean }) {
  const { t } = useI18n();
  const date = new Date(target);
  const now = useNow(date.getTime());
  const c = countdown(date, new Date(now));
  const level = alertLevel(date, new Date(now), thresholds);
  const blocks = [
    [c.days, t("countdown.days")],
    [c.hours, t("countdown.hours")],
    [c.minutes, t("countdown.minutes")],
  ] as const;
  return (
    <div className={cn("flex items-end gap-1.5", className)} role="timer" aria-live="off" aria-label={`${c.days} ${t("countdown.days")} ${c.hours} ${t("countdown.hours")} ${c.minutes} ${t("countdown.minutes")}`}>
      {c.past && <span className={cn("me-1 self-center text-xs font-medium", dark ? "text-red-300" : "text-danger")}>{t("countdown.overdueBy")}</span>}
      {blocks.map(([v, label], i) => (
        <div key={i} className="flex items-end gap-1.5">
          <div className="flex flex-col items-center">
            <span
              suppressHydrationWarning
              className={cn(
                "min-w-[2.4ch] rounded-md px-1.5 py-0.5 text-center font-mono text-xl font-semibold tabular leading-tight",
                dark ? "bg-white/10 text-white" : cn("bg-surface-muted", LEVEL_TEXT[level]),
              )}
            >
              {pad(v)}
            </span>
            <span className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-wide", dark ? "text-nav-muted" : "text-ink-subtle")}>{label}</span>
          </div>
          {i < 2 && <span className={cn("mb-4 text-sm", dark ? "text-nav-muted" : "text-ink-subtle")}>:</span>}
        </div>
      ))}
    </div>
  );
}

/** Compact inline countdown, e.g. "1d 14h 32m" with alert colour. */
export function CountdownInline({ target, thresholds, className, showLevel }: { target: string; thresholds?: AlertThreshold[]; className?: string; showLevel?: boolean }) {
  const { t } = useI18n();
  const date = new Date(target);
  const now = useNow(date.getTime());
  const c = countdown(date, new Date(now));
  const level = alertLevel(date, new Date(now), thresholds);
  const parts: [number, string][] =
    c.days > 0 ? [[c.days, t("common.days")], [c.hours, t("common.hours")]] : c.hours > 0 ? [[c.hours, t("common.hours")], [c.minutes, t("common.minutes")]] : [[c.minutes, t("common.minutes")]];
  return (
    <span suppressHydrationWarning className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium tabular", LEVEL_TEXT[level], className)}>
      {level !== "NONE" && level !== "REMINDER" && <span aria-hidden className={cn("size-1.5 rounded-full bg-current", (level === "IMMEDIATE" || level === "OVERDUE") && "animate-pulse-soft")} />}
      {c.past && <span>{t("countdown.overdueBy")}</span>}
      {/* Each number+unit is its own isolated run so Arabic/Latin bidi never scrambles it */}
      {parts.map(([n, u], i) => (
        <span key={i} suppressHydrationWarning className="inline-flex items-baseline gap-px [unicode-bidi:isolate]">
          <span>{n}</span>
          <span className="text-[0.92em] opacity-80">{u}</span>
        </span>
      ))}
      {showLevel && <span className="font-normal opacity-80">· {t(`enums.alertLevel.${level}`)}</span>}
    </span>
  );
}

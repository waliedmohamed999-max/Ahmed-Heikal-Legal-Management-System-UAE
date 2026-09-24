"use client";

import Link from "next/link";
import { Gavel } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { CountdownInline } from "@/components/countdown";
import { Tooltip } from "@/components/ui/overlay";
import { formatDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type NextHearingData = {
  id: string;
  startsAt: string;
  status: string;
  sessionType: string | null;
  courtRoom: string | null;
  isRemote: boolean;
  court: { name: string; nameAr: string | null } | null;
  lawyer: { name: string; nameAr: string | null } | null;
  matter: { id: string; internalNumber: string; officialCaseNumber: string | null; title: string; titleAr: string | null };
};

/**
 * Always-visible next hearing — sidebar footer on desktop (full or icon rail).
 * Links to hearing preparation.
 */
export function NextHearingMini({ data, narrow }: { data: NextHearingData | null; narrow?: boolean }) {
  const { t, locale, tz } = useI18n();
  if (!data) return null;
  const title = locale === "ar" ? data.matter.titleAr || data.matter.title : data.matter.title;
  const href = `/app/hearings/${data.id}/prepare`;
  if (narrow) {
    return (
      <Tooltip content={`${t("shell.nextHearing")} · ${title}`} side={locale === "ar" ? "left" : "right"}>
        <Link href={href} className="mx-auto flex size-9 items-center justify-center rounded-md text-ev-hearing transition-colors hover:bg-surface-sunken" aria-label={t("shell.nextHearing")}>
          <Gavel className="size-4" />
        </Link>
      </Tooltip>
    );
  }
  return (
    <Link href={href} className="group block rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-caption font-medium text-ink-subtle">
          <Gavel className="size-3 text-ev-hearing" aria-hidden />
          {t("shell.nextHearing")}
        </span>
        <CountdownInline target={data.startsAt} className="text-caption" />
      </div>
      <div className="mt-1 truncate text-body font-medium text-ink group-hover:underline bidi-plain">{title}</div>
      <div className="mt-0.5 truncate text-meta text-ink-muted">
        {formatDate(data.startsAt, locale, tz, { day: "numeric", month: "short" })} · {formatTime(data.startsAt, locale, tz)}
      </div>
    </Link>
  );
}

/** Compact chip for the top bar when the sidebar is not shown (tablet / mobile). */
export function NextHearingChip({ data, className }: { data: NextHearingData | null; className?: string }) {
  const { t } = useI18n();
  if (!data) return null;
  return (
    <Link
      href={`/app/hearings/${data.id}/prepare`}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-meta text-ink-muted transition-colors hover:bg-surface-muted", className)}
      aria-label={t("shell.nextHearing")}
    >
      <Gavel className="size-3.5 text-ev-hearing" aria-hidden />
      <CountdownInline target={data.startsAt} className="text-meta" />
    </Link>
  );
}

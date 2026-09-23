"use client";

import Link from "next/link";
import { Gavel, FolderOpen, ClipboardList, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { CountdownInline } from "@/components/countdown";
import { Badge, HEARING_STATUS_TONE } from "@/components/ui/badge";
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

/** Always-visible next-hearing strip in the top bar. */
export function NextHearingStrip({ data }: { data: NextHearingData | null }) {
  const { t, locale, tz } = useI18n();
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-ink-subtle">
        <Gavel className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t("hearingWidget.none")}</span>
      </div>
    );
  }
  const title = locale === "ar" ? data.matter.titleAr || data.matter.title : data.matter.title;
  const court = data.court ? (locale === "ar" ? data.court.nameAr || data.court.name : data.court.name) : null;
  const base = `/app/cases/${data.matter.id}`;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={`${base}/hearings?h=${data.id}`} className="group flex min-w-0 items-center gap-2.5 rounded-md py-1 pe-2 text-[13px]" aria-label={t("hearingWidget.label")}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--ev-hearing)]/10 text-ev-hearing">
          <Gavel className="size-4" aria-hidden />
        </span>
        <span className="hidden text-[11.5px] font-medium uppercase tracking-wide text-ink-subtle xl:inline">{t("hearingWidget.label")}</span>
        <span className="ltr-nums hidden shrink-0 whitespace-nowrap font-mono text-[12px] text-ink-muted md:inline">{data.matter.internalNumber}</span>
        <span className="min-w-0 truncate font-medium text-ink group-hover:underline">{title}</span>
        <span className="hidden shrink-0 text-ink-muted 2xl:inline">· {court}</span>
        <span className="hidden shrink-0 text-ink-muted sm:inline">
          · {formatDate(data.startsAt, locale, tz, { day: "numeric", month: "short" })} {formatTime(data.startsAt, locale, tz)}
        </span>
      </Link>
      <CountdownInline target={data.startsAt} className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5" />
      <Badge tone={HEARING_STATUS_TONE[data.status]} className="hidden shrink-0 md:inline-flex">
        {t(`enums.hearingStatus.${data.status}`)}
      </Badge>
      <div className="hidden shrink-0 items-center gap-0.5 xl:flex">
        <StripLink href={base} icon={ArrowUpRight} label={t("hearingWidget.openCase")} />
        <StripLink href={`${base}/documents`} icon={FolderOpen} label={t("hearingWidget.documents")} />
        <StripLink href={`/app/hearings/${data.id}/prepare`} icon={ClipboardList} label={t("hearingWidget.prepare")} />
      </div>
    </div>
  );
}

function StripLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className={cn("inline-flex h-7 items-center gap-1 rounded px-1.5 text-[12px] text-ink-muted hover:bg-surface-muted hover:text-ink")}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Link>
  );
}

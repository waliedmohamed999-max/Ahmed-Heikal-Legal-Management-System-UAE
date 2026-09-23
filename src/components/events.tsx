"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { formatTime, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CountdownInline } from "./countdown";
import { Badge } from "./ui/badge";

import { EVENT_STYLE } from "./event-style";
export { EVENT_STYLE };

export function EventTypeChip({ type, className }: { type: string; className?: string }) {
  const { t } = useI18n();
  const s = EVENT_STYLE[type] ?? EVENT_STYLE.FOLLOW_UP;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11.5px] font-medium", className)} style={{ color: s.color }}>
      <s.icon className="size-3.5" aria-hidden />
      {t(`enums.eventType.${type}`)}
    </span>
  );
}

export type EventRowData = {
  id: string;
  eventType: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  matter: { id: string; internalNumber: string; title: string; titleAr: string | null } | null;
  person?: string | null;
  personAr?: string | null;
  location?: string | null;
  needsVerification?: boolean;
  href: string;
  status?: string;
};

/** One agenda/event line: time rail, type colour bar, title, case reference, countdown. */
export function EventRow({ e, showDate, showCountdown = true }: { e: EventRowData; showDate?: boolean; showCountdown?: boolean }) {
  const { t, locale, tz } = useI18n();
  const s = EVENT_STYLE[e.eventType] ?? EVENT_STYLE.FOLLOW_UP;
  const person = locale === "ar" ? e.personAr || e.person : e.person;
  return (
    <Link href={e.href} className="group flex items-stretch gap-3 px-4 py-2.5 hover:bg-surface-muted/60">
      <div className="w-[64px] shrink-0 pt-0.5 text-end">
        <div className="text-[12.5px] font-medium tabular text-ink">{formatTime(e.startsAt, locale, tz)}</div>
        {showDate && <div className="text-[11px] text-ink-subtle">{formatDate(e.startsAt, locale, tz, { day: "numeric", month: "short", year: undefined })}</div>}
      </div>
      <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ background: s.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-ink group-hover:underline">{e.title}</span>
          {e.needsVerification && (
            <Badge tone="warning">
              <ShieldAlert /> {t("enums.verification.NEEDS_VERIFICATION")}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-muted">
          <EventTypeChip type={e.eventType} />
          {e.matter && (
            <span className="truncate">
              <span className="ltr-nums font-mono text-[11.5px] text-ink-subtle">{e.matter.internalNumber}</span> · {locale === "ar" ? e.matter.titleAr || e.matter.title : e.matter.title}
            </span>
          )}
          {e.location && <span className="truncate text-ink-subtle">· {e.location}</span>}
          {person && <span className="truncate text-ink-subtle">· {person}</span>}
        </div>
      </div>
      {showCountdown && <CountdownInline target={e.startsAt} className="self-center" />}
    </Link>
  );
}

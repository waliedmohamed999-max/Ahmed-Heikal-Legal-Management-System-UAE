"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GripVertical, Lock } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { EVENT_STYLE, EventRow } from "@/components/events";
import { EmptyState } from "@/components/ui/layout";
import { useNow } from "@/components/countdown";
import { formatDate, formatTime, zonedParts } from "@/lib/time";
import { cn } from "@/lib/utils";
import { moveAgendaItemAction } from "@/app/app/event-actions";
import type { AgendaItem } from "@/server/services/agenda";

const SLOT_MIN = 30;
const HOUR_PX = 56;

function useMove() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const move = async (item: AgendaItem, start: Date) => {
    if (!item.movable) return;
    setBusy(true);
    const r = await moveAgendaItemAction({ kind: item.kind as "APPOINTMENT" | "TASK", id: item.id, start: start.toISOString() });
    setBusy(false);
    if (r.ok) {
      toast.success(t("calendar.moved"));
      router.refresh();
    } else toast.error(t(`errors.${r.error}`));
  };
  return { move, busy };
}

function minutesOfDay(iso: string, tz: string) {
  const p = zonedParts(new Date(iso), tz);
  return p.hour * 60 + p.minute;
}

/** Hour grid for one or more days (Day, Week, Today agenda). Drag & drop only for movable items. */
export function TimeGrid({ days, items, startHour = 7, endHour = 21, compactHeader }: { days: string[]; items: AgendaItem[]; startHour?: number; endHour?: number; compactHeader?: boolean }) {
  const { t, locale, tz } = useI18n();
  const { move, busy } = useMove();
  const now = useNow();
  const [drag, setDrag] = useState<AgendaItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const dayKey = (iso: string) => {
    const p = zonedParts(new Date(iso), tz);
    return `${p.year}-${p.month}-${p.day}`;
  };
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const i of items) {
      const k = dayKey(i.startsAt);
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tz]);
  const todayKey = dayKey(new Date(now).toISOString());
  const nowMin = minutesOfDay(new Date(now).toISOString(), tz);

  return (
    <div className={cn("overflow-x-auto scrollbar-thin", busy && "pointer-events-none opacity-70")}>
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
        <div className="sticky top-0 z-[2] border-b border-line bg-surface" />
        {days.map((d) => {
          const k = dayKey(d);
          return (
            <div key={d} className={cn("sticky top-0 z-[2] border-b border-s border-line bg-surface px-2 py-2 text-center", k === todayKey && "bg-accent-soft/60")}>
              <div className="text-[11px] font-medium uppercase text-ink-subtle">{formatDate(d, locale, tz, { weekday: "short", day: undefined, month: undefined, year: undefined })}</div>
              <div className={cn("text-[15px] font-semibold tabular", k === todayKey ? "text-accent" : "text-ink")}>{formatDate(d, locale, tz, { day: "numeric", month: compactHeader ? undefined : "short", year: undefined })}</div>
            </div>
          );
        })}
        {/* All-day / untimed deadlines row */}
        <div className="border-b border-line py-1 text-end text-[10.5px] text-ink-subtle pe-1.5">{t("agenda.allDay")}</div>
        {days.map((d) => {
          const k = dayKey(d);
          const allDay = (byDay.get(k) ?? []).filter((i) => i.kind === "DEADLINE" && (minutesOfDay(i.startsAt, tz) < startHour * 60 || minutesOfDay(i.startsAt, tz) >= endHour * 60));
          return (
            <div key={`ad-${d}`} className="min-h-7 space-y-0.5 border-b border-s border-line p-0.5">
              {allDay.map((i) => <Chip key={i.id} i={i} />)}
            </div>
          );
        })}
        {/* Hour rows */}
        <div className="relative">
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_PX }} className="border-b border-line pe-1.5 text-end text-[10.5px] tabular text-ink-subtle">
              <span className="relative -top-2">{formatTime(new Date(Date.UTC(2026, 0, 1, h - 4, 0)).toISOString(), locale, "Asia/Dubai")}</span>
            </div>
          ))}
        </div>
        {days.map((d) => {
          const k = dayKey(d);
          const list = (byDay.get(k) ?? []).filter((i) => !(i.kind === "DEADLINE" && (minutesOfDay(i.startsAt, tz) < startHour * 60 || minutesOfDay(i.startsAt, tz) >= endHour * 60)));
          const dayStart = new Date(d).getTime();
          return (
            <div key={`col-${d}`} className={cn("relative border-s border-line", k === todayKey && "bg-accent-soft/20")}>
              {hours.flatMap((h) =>
                [0, 30].map((m) => {
                  const slotKey = `${d}-${h}-${m}`;
                  return (
                    <div
                      key={slotKey}
                      style={{ height: HOUR_PX / 2 }}
                      className={cn("border-line", m === 30 ? "border-b" : "border-b border-dashed border-b-line/60", over === slotKey && "bg-accent-soft")}
                      onDragOver={(e) => { if (drag?.movable) { e.preventDefault(); setOver(slotKey); } }}
                      onDragLeave={() => setOver(null)}
                      onDrop={(e) => { e.preventDefault(); setOver(null); if (drag) move(drag, new Date(dayStart + (h * 60 + m) * 60_000)); setDrag(null); }}
                    />
                  );
                }),
              )}
              {k === todayKey && nowMin >= startHour * 60 && nowMin < endHour * 60 && (
                <div aria-label={t("agenda.now")} className="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-critical" style={{ top: ((nowMin - startHour * 60) / 60) * HOUR_PX }}>
                  <span className="absolute -top-1.5 start-0 size-2.5 rounded-full bg-critical" />
                </div>
              )}
              {list.map((i) => {
                const startMin = Math.max(minutesOfDay(i.startsAt, tz), startHour * 60);
                const endMin = i.endsAt ? Math.min(minutesOfDay(i.endsAt, tz), endHour * 60) : startMin + SLOT_MIN;
                const top = ((startMin - startHour * 60) / 60) * HOUR_PX;
                const height = Math.max(((endMin - startMin) / 60) * HOUR_PX, 24);
                const s = EVENT_STYLE[i.eventType];
                return (
                  <Link
                    key={`${i.kind}-${i.id}`}
                    href={i.href}
                    draggable={i.movable}
                    onDragStart={() => setDrag(i)}
                    onDragEnd={() => setDrag(null)}
                    className={cn("group absolute inset-x-1 z-[1] overflow-hidden rounded-md border-s-[3px] px-1.5 py-1 text-[11.5px] leading-tight shadow-xs hover:z-[3] hover:shadow-md", i.movable ? "cursor-grab" : "cursor-pointer")}
                    style={{ top, height, borderInlineStartColor: s.color, background: `color-mix(in srgb, ${s.color} 11%, var(--surface))` }}
                    title={i.title}
                  >
                    <div className="flex items-center gap-1 font-medium text-ink">
                      {i.movable ? <GripVertical className="size-3 shrink-0 opacity-0 group-hover:opacity-60" /> : i.kind === "HEARING" && <Lock className="size-3 shrink-0 opacity-50" />}
                      <span className="truncate">{i.title}</span>
                    </div>
                    <div className="truncate text-ink-muted">{formatTime(i.startsAt, locale, tz)}{i.matter && ` · ${i.matter.internalNumber}`}</div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ i }: { i: AgendaItem }) {
  const s = EVENT_STYLE[i.eventType];
  return (
    <Link href={i.href} className="block truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-ink hover:underline" style={{ background: `color-mix(in srgb, ${s.color} 14%, var(--surface))`, borderInlineStart: `3px solid ${s.color}` }} title={i.title}>
      {i.title}
    </Link>
  );
}

/** Month grid; each day shows up to 3 events, then "+n more". */
export function MonthGrid({ weeks, month, items }: { weeks: string[][]; month: number; items: AgendaItem[] }) {
  const { t, locale, tz } = useI18n();
  const now = useNow();
  const { move } = useMove();
  const [drag, setDrag] = useState<AgendaItem | null>(null);
  const dayKey = (iso: string) => {
    const p = zonedParts(new Date(iso), tz);
    return `${p.year}-${p.month}-${p.day}`;
  };
  const map = new Map<string, AgendaItem[]>();
  for (const i of items) map.set(dayKey(i.startsAt), [...(map.get(dayKey(i.startsAt)) ?? []), i]);
  const today = dayKey(new Date(now).toISOString());
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="grid min-w-[700px] grid-cols-7">
        {weeks[0].map((d) => (
          <div key={`h-${d}`} className="border-b border-line px-2 py-2 text-[11px] font-medium uppercase text-ink-subtle">{formatDate(d, locale, tz, { weekday: "short", day: undefined, month: undefined, year: undefined })}</div>
        ))}
        {weeks.flat().map((d) => {
          const k = dayKey(d);
          const list = map.get(k) ?? [];
          const inMonth = zonedParts(new Date(d), tz).month === month;
          return (
            <div key={d} className={cn("min-h-28 border-b border-s border-line p-1.5 first:border-s-0 [&:nth-child(7n+1)]:border-s-0", !inMonth && "bg-surface-muted/50")}
              onDragOver={(e) => drag?.movable && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!drag) return;
                const orig = zonedParts(new Date(drag.startsAt), tz);
                move(drag, new Date(new Date(d).getTime() + (orig.hour * 60 + orig.minute) * 60_000));
                setDrag(null);
              }}>
              <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-[12px] tabular", k === today ? "bg-accent font-semibold text-white" : inMonth ? "text-ink" : "text-ink-subtle")}>
                {zonedParts(new Date(d), tz).day}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((i) => (
                  <div key={`${i.kind}-${i.id}`} draggable={i.movable} onDragStart={() => setDrag(i)} className={i.movable ? "cursor-grab" : undefined}>
                    <Chip i={i} />
                  </div>
                ))}
                {list.length > 3 && <p className="px-1 text-[11px] text-ink-subtle">{t("calendar.more", { n: list.length - 3 })}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Chronological agenda list grouped by day. */
export function AgendaList({ items }: { items: AgendaItem[] }) {
  const { t, locale, tz } = useI18n();
  if (!items.length) return <EmptyState title={t("calendar.empty")} />;
  const groups: { key: string; label: string; items: AgendaItem[] }[] = [];
  for (const i of items) {
    const p = zonedParts(new Date(i.startsAt), tz);
    const key = `${p.year}-${p.month}-${p.day}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(i);
    else groups.push({ key, label: formatDate(i.startsAt, locale, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), items: [i] });
  }
  return (
    <div>
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="sticky top-0 z-[1] border-b border-line bg-surface-muted/90 px-4 py-1.5 text-[12px] font-semibold text-ink-muted backdrop-blur">{g.label}</h3>
          <ul className="divide-y divide-line">{g.items.map((i) => <li key={`${i.kind}-${i.id}`}><EventRow e={i} /></li>)}</ul>
        </section>
      ))}
    </div>
  );
}

export function Legend({ types }: { types?: string[] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label={t("calendar.legend")}>
      {(types ?? Object.keys(EVENT_STYLE)).map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="size-2.5 rounded-sm" style={{ background: EVENT_STYLE[k].color }} /> {t(`enums.eventType.${k}`)}
        </li>
      ))}
    </ul>
  );
}

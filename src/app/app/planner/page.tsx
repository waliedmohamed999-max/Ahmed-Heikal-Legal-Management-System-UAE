import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getAgenda } from "@/server/services/agenda";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { EVENT_STYLE } from "@/components/event-style";
import { Legend } from "@/components/calendar/board";
import { addDaysZoned, formatDate, formatTime, weekRange, zonedParts } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Weekly Planner" };

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const tz = ctx.org.timezone;
  const { w } = await searchParams;
  const offset = Number.isFinite(Number(w)) ? Math.max(-52, Math.min(52, Number(w))) : 0;
  const anchor = addDaysZoned(new Date(), offset * 7, tz);
  const { start, end } = weekRange(anchor, tz);
  const items = await getAgenda(ctx, { from: start, to: end, kinds: ["HEARING", "APPOINTMENT", "DEADLINE"] });
  const days = Array.from({ length: 7 }, (_, i) => addDaysZoned(start, i, tz));
  const key = (d: Date | string) => { const p = zonedParts(new Date(d), tz); return `${p.year}-${p.month}-${p.day}`; };
  const today = key(new Date());
  const Prev = locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = locale === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("planner.title")} subtitle={t("planner.subtitle")} actions={
        <div className="flex items-center gap-1">
          <Button asChild size="icon-sm" variant="secondary" aria-label={t("planner.prev")}><Link href={`/app/planner?w=${offset - 1}`}><Prev /></Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/app/planner">{t("planner.thisWeek")}</Link></Button>
          <Button asChild size="icon-sm" variant="secondary" aria-label={t("planner.next")}><Link href={`/app/planner?w=${offset + 1}`}><Next /></Link></Button>
        </div>
      } />
      <p className="mt-4 text-body font-medium text-ink-muted">{formatDate(start, locale, tz)} – {formatDate(days[6], locale, tz)}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const list = items.filter((i) => key(i.startsAt) === key(d));
          return (
            <section key={d.toISOString()} className={cn("flex min-h-56 flex-col rounded-lg border bg-surface shadow-xs", key(d) === today ? "border-accent/50" : "border-line")}>
              <header className={cn("border-b border-line px-3 py-2", key(d) === today && "bg-accent-soft/60")}>
                <div className="text-caption font-medium uppercase text-ink-subtle">{formatDate(d, locale, tz, { weekday: "long", day: undefined, month: undefined, year: undefined })}</div>
                <div className="text-heading font-semibold tabular text-ink">{formatDate(d, locale, tz, { day: "numeric", month: "short", year: undefined })}</div>
              </header>
              <ul className="flex-1 space-y-1.5 p-2">
                {list.length === 0 && <li className="pt-6 text-center text-meta text-ink-subtle">{t("planner.empty")}</li>}
                {list.map((i) => {
                  const s = EVENT_STYLE[i.eventType];
                  return (
                    <li key={`${i.kind}-${i.id}`}>
                      <Link href={i.href} className="block rounded-md border-s-[3px] px-2 py-1.5 hover:shadow-sm" style={{ borderInlineStartColor: s.color, background: `color-mix(in srgb, ${s.color} 9%, var(--surface))` }}>
                        <div className="flex items-center gap-1 text-caption font-medium tabular" style={{ color: s.color }}><s.icon className="size-3" /> {formatTime(i.startsAt, locale, tz)}</div>
                        <div className="line-clamp-2 text-meta font-medium text-ink">{i.title}</div>
                        {i.matter && <div className="ltr-nums truncate font-mono text-[10.5px] text-ink-subtle">{i.matter.internalNumber}</div>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-4"><Legend /></div>
    </div>
  );
}

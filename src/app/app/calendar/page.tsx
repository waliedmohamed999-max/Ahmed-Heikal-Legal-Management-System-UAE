import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getAgenda, type AgendaKind } from "@/server/services/agenda";
import { PageHeader } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { TimeGrid, MonthGrid, AgendaList, Legend } from "@/components/calendar/board";
import { QuickButton } from "@/components/quick-button";
import { EVENT_STYLE } from "@/components/event-style";
import { addDaysZoned, dayRange, formatDate, monthRange, weekRange, zonedParts } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };
const VIEWS = ["day", "week", "month", "agenda"] as const;
const TYPE_FILTERS: { key: string; kinds: AgendaKind[]; types?: string[] }[] = [
  { key: "HEARING", kinds: ["HEARING"] },
  { key: "COURT_DEADLINE", kinds: ["DEADLINE"], types: ["COURT_DEADLINE"] },
  { key: "SUBMISSION", kinds: ["DEADLINE"], types: ["SUBMISSION"] },
  { key: "CLIENT_MEETING", kinds: ["APPOINTMENT"], types: ["CLIENT_MEETING"] },
  { key: "INTERNAL_MEETING", kinds: ["APPOINTMENT"], types: ["INTERNAL_MEETING"] },
  { key: "EXPERT_MEETING", kinds: ["DEADLINE"], types: ["EXPERT_MEETING"] },
  { key: "PAYMENT", kinds: ["DEADLINE"], types: ["PAYMENT"] },
  { key: "TASK_DEADLINE", kinds: ["TASK", "DEADLINE"], types: ["TASK_DEADLINE"] },
  { key: "FOLLOW_UP", kinds: ["DEADLINE"], types: ["FOLLOW_UP"] },
];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("calendar.view")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const tz = ctx.org.timezone;
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as (typeof VIEWS)[number]) : "week";
  const scope = ctx.can("calendar.viewTeam") && (sp.scope === "team" || (!sp.scope && ctx.principal.scope === "ALL")) ? "team" : "mine";
  const hidden = new Set((sp.hide ?? "").split(",").filter(Boolean));
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? new Date(`${sp.date}T12:00:00+04:00`) : new Date();

  let range: { start: Date; end: Date };
  if (view === "day") range = dayRange(anchor, tz);
  else if (view === "week") range = weekRange(anchor, tz);
  else if (view === "month") {
    const p = zonedParts(anchor, tz);
    const m = monthRange(p.year, p.month, tz);
    range = { start: weekRange(m.start, tz).start, end: weekRange(new Date(m.end.getTime() - 1), tz).end };
  } else range = { start: dayRange(anchor, tz).start, end: addDaysZoned(dayRange(anchor, tz).start, 30, tz) };

  const all = await getAgenda(ctx, { from: range.start, to: range.end, mine: scope === "mine" });
  const items = all.filter((i) => !hidden.has(i.eventType));

  const days: string[] = [];
  for (let d = range.start; d < range.end; d = addDaysZoned(d, 1, tz)) days.push(d.toISOString());
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const step = view === "day" ? 1 : view === "week" ? 7 : view === "month" ? 31 : 30;
  const fmt = (d: Date) => { const p = zonedParts(d, tz); return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
  const link = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ view, scope, date: sp.date ?? "", hide: sp.hide ?? "", ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/app/calendar?${u}`;
  };
  const prevDate = fmt(view === "month" ? new Date(new Date(monthRange(zonedParts(anchor, tz).year, zonedParts(anchor, tz).month, tz).start).getTime() - 86400_000) : addDaysZoned(anchor, -step, tz));
  const nextDate = fmt(view === "month" ? monthRange(zonedParts(anchor, tz).year, zonedParts(anchor, tz).month, tz).end : addDaysZoned(anchor, step, tz));
  const Prev = locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = locale === "ar" ? ChevronLeft : ChevronRight;
  const title =
    view === "month" ? formatDate(anchor, locale, tz, { day: undefined, month: "long", year: "numeric" }) :
    view === "day" ? formatDate(anchor, locale, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) :
    `${formatDate(range.start, locale, tz, { day: "numeric", month: "short", year: undefined })} – ${formatDate(new Date(range.end.getTime() - 1), locale, tz)}`;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("calendar.title")} actions={<>{ctx.can("appointments.manage") && <QuickButton type="appointment" label={t("appointments.new")} />}{ctx.can("hearings.manage") && <QuickButton type="hearing" label={t("hearings.new")} variant="primary" />}</>} />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="secondary" size="icon-sm" aria-label={t("common.previous")}><Link href={link({ date: prevDate })}><Prev /></Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href={link({ date: null })}>{t("calendar.today")}</Link></Button>
          <Button asChild variant="secondary" size="icon-sm" aria-label={t("common.next")}><Link href={link({ date: nextDate })}><Next /></Link></Button>
        </div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {ctx.can("calendar.viewTeam") && (
            <div className="flex rounded-md border border-line bg-surface p-0.5">
              {(["mine", "team"] as const).map((s) => <Link key={s} href={link({ scope: s })} className={cn("rounded px-2.5 py-1 text-[12.5px] font-medium", scope === s ? "bg-brand text-brand-fg" : "text-ink-muted")}>{t(`calendar.scope.${s}`)}</Link>)}
            </div>
          )}
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {VIEWS.map((v) => <Link key={v} href={link({ view: v })} className={cn("rounded px-2.5 py-1 text-[12.5px] font-medium", view === v ? "bg-brand text-brand-fg" : "text-ink-muted")}>{t(`calendar.views.${v}`)}</Link>)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((f) => {
          const off = hidden.has(f.key);
          const next = new Set(hidden);
          if (off) next.delete(f.key); else next.add(f.key);
          return (
            <Link key={f.key} href={link({ hide: [...next].join(",") || null })} aria-pressed={!off}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors", off ? "border-line text-ink-subtle line-through" : "border-line-strong bg-surface text-ink")}>
              <span className="size-2 rounded-full" style={{ background: EVENT_STYLE[f.key].color }} />
              {t(`enums.eventType.${f.key}`)}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        {view === "month" ? <MonthGrid weeks={weeks} month={zonedParts(anchor, tz).month} items={items} /> :
         view === "agenda" ? <AgendaList items={items} /> :
         <TimeGrid days={days} items={items} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <p className="text-[12px] text-ink-subtle">{t("calendar.dragHint")}</p>
      </div>
    </div>
  );
}

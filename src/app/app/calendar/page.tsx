import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getAgenda, type AgendaKind } from "@/server/services/agenda";
import { getReference } from "@/server/services/reference";
import { Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { TimeGrid, MonthGrid, AgendaList } from "@/components/calendar/board";
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
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const view = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as (typeof VIEWS)[number]) : "week";
  const teamAllowed = ctx.can("calendar.viewTeam");
  const scope = teamAllowed && (sp.scope === "team" || (!sp.scope && ctx.principal.scope === "ALL")) ? "team" : "mine";
  const hidden = new Set((sp.hide ?? "").split(",").filter(Boolean));
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? new Date(`${sp.date}T12:00:00+04:00`) : new Date();
  const ref = teamAllowed ? await getReference(ctx.org.id) : null;
  const person = teamAllowed && sp.user && ref?.staff.some((s) => s.id === sp.user) ? sp.user : null;

  let range: { start: Date; end: Date };
  if (view === "day") range = dayRange(anchor, tz);
  else if (view === "week") range = weekRange(anchor, tz);
  else if (view === "month") {
    const p = zonedParts(anchor, tz);
    const m = monthRange(p.year, p.month, tz);
    range = { start: weekRange(m.start, tz).start, end: weekRange(new Date(m.end.getTime() - 1), tz).end };
  } else range = { start: dayRange(anchor, tz).start, end: addDaysZoned(dayRange(anchor, tz).start, 30, tz) };

  const all = await getAgenda(ctx, person ? { from: range.start, to: range.end, mine: true, userId: person } : { from: range.start, to: range.end, mine: scope === "mine" });
  const items = all.filter((i) => !hidden.has(i.eventType));
  const countByType = all.reduce<Record<string, number>>((a, i) => ((a[i.eventType] = (a[i.eventType] ?? 0) + 1), a), {});

  const days: string[] = [];
  for (let d = range.start; d < range.end; d = addDaysZoned(d, 1, tz)) days.push(d.toISOString());
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const step = view === "day" ? 1 : view === "week" ? 7 : view === "month" ? 31 : 30;
  const fmt = (d: Date) => { const p = zonedParts(d, tz); return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
  const link = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ view, scope, date: sp.date ?? "", hide: sp.hide ?? "", user: person ?? "", ...patch }).filter(([, v]) => v) as [string, string][]);
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

  const typeToggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return link({ hide: [...next].join(",") || null });
  };

  return (
    <div className="flex min-h-[calc(100dvh-48px)]">
      {/* Calendar sidebar — scope, event types (also the legend), people */}
      <aside className="hidden w-56 shrink-0 border-e border-line px-4 py-5 xl:block">
        {teamAllowed && (
          <section>
            <h2 className="eyebrow">{t("calendar.title")}</h2>
            <ul className="mt-2 space-y-0.5">
              {(["mine", "team"] as const).map((s) => (
                <li key={s}>
                  <Link href={link({ scope: s, user: null })} className={cn("flex h-7 items-center gap-2 rounded-md px-2 text-body transition-colors hover:bg-surface-muted", scope === s && !person ? "font-medium text-ink" : "text-ink-muted")}>
                    <Check className={cn("size-3.5", scope === s && !person ? "opacity-100" : "opacity-0")} aria-hidden />
                    {t(`calendar.scope.${s}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="eyebrow">{t("common.type")}</h2>
          <ul className="mt-2 space-y-0.5">
            {TYPE_FILTERS.map((f) => {
              const on = !hidden.has(f.key);
              return (
                <li key={f.key}>
                  <Link href={typeToggle(f.key)} aria-pressed={on} className="flex h-7 items-center gap-2 rounded-md px-2 text-body transition-colors hover:bg-surface-muted">
                    <span aria-hidden className={cn("flex size-3.5 items-center justify-center rounded-[3px] border", on ? "border-transparent" : "border-line-strong bg-surface")} style={on ? { background: EVENT_STYLE[f.key].color } : undefined}>
                      {on && <Check className="size-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", on ? "text-ink" : "text-ink-subtle")}>{t(`enums.eventType.${f.key}`)}</span>
                    {countByType[f.key] ? <span className="text-meta tabular text-ink-subtle">{countByType[f.key]}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {ref && (
          <section className="mt-6">
            <h2 className="eyebrow">{t("nav.team")}</h2>
            <ul className="mt-2 space-y-0.5">
              {ref.staff.map((s) => (
                <li key={s.id}>
                  <Link href={link({ user: person === s.id ? null : s.id, scope: "team" })} className={cn("flex h-7 items-center gap-2 rounded-md px-2 text-body transition-colors hover:bg-surface-muted", person === s.id ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted")}>
                    <Avatar name={L(s.name, s.nameAr)} size={18} />
                    <span className="truncate">{L(s.name, s.nameAr)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-caption text-ink-subtle">{t("calendar.dragHint")}</p>
      </aside>

      <div className="min-w-0 flex-1 px-4 py-4 sm:px-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon-sm" aria-label={t("common.previous")}><Link href={link({ date: prevDate })}><Prev /></Link></Button>
            <Button asChild variant="secondary" size="sm"><Link href={link({ date: null })}>{t("calendar.today")}</Link></Button>
            <Button asChild variant="ghost" size="icon-sm" aria-label={t("common.next")}><Link href={link({ date: nextDate })}><Next /></Link></Button>
          </div>
          <h1 className="text-heading font-semibold text-ink">{title}</h1>
          {person && ref && <span className="rounded-sm bg-surface-sunken px-1.5 text-meta text-ink-muted">{L(ref.staff.find((s) => s.id === person)!.name, ref.staff.find((s) => s.id === person)!.nameAr)}</span>}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <div role="radiogroup" className="inline-flex items-center rounded-md border border-line bg-surface-muted p-0.5">
              {VIEWS.map((v) => (
                <Link key={v} href={link({ view: v })} role="radio" aria-checked={view === v} className={cn("inline-flex h-7 items-center rounded-[5px] px-2.5 text-body font-medium transition-colors", view === v ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-subtle hover:text-ink")}>
                  {t(`calendar.views.${v}`)}
                </Link>
              ))}
            </div>
            {ctx.can("appointments.manage") && <QuickButton type="appointment" label={t("appointments.new")} />}
            {ctx.can("hearings.manage") && <QuickButton type="hearing" label={t("hearings.new")} variant="primary" />}
          </div>
        </div>

        {/* Compact type filter for screens without the sidebar */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-none xl:hidden">
          {TYPE_FILTERS.map((f) => {
            const on = !hidden.has(f.key);
            return (
              <Link key={f.key} href={typeToggle(f.key)} aria-pressed={on} className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-meta transition-colors", on ? "border-line bg-surface text-ink" : "border-dashed border-line-strong text-ink-subtle")}>
                <span className="size-2 rounded-full" style={{ background: on ? EVENT_STYLE[f.key].color : "var(--line-strong)" }} />
                {t(`enums.eventType.${f.key}`)}
              </Link>
            );
          })}
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          {view === "month" ? <MonthGrid weeks={weeks} month={zonedParts(anchor, tz).month} items={items} /> :
           view === "agenda" ? <AgendaList items={items} /> :
           <TimeGrid days={days} items={items} />}
        </div>
      </div>
    </div>
  );
}

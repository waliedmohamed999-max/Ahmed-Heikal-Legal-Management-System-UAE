import Link from "next/link";
import { Gavel, CalendarClock, CheckSquare, ShieldCheck, ClipboardList, ArrowUpRight, FolderOpen, Clock3, Activity, Wallet, Circle } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { commandCenter, financialSnapshot, nextHearing, orgThresholds, teamWorkload } from "@/server/services/dashboard";
import { Page, Panel, EmptyState, Avatar, InlineStats, SectionLink, Timeline } from "@/components/ui/layout";
import { Badge, StatusText, ALERT_TONE, HEARING_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownInline } from "@/components/countdown";
import { EVENT_STYLE } from "@/components/event-style";
import { formatHijri, formatLongDate, formatMoney, formatMinutes, formatTime, formatDate, relativeTime, zonedParts } from "@/lib/time";
import { cn } from "@/lib/utils";
import { WidgetCustomizer } from "./widget-customizer";

export const metadata = { title: "Home" };

const WIDGETS = ["nextHearing", "agenda", "critical", "tasks", "approvals", "activity", "workload", "finance"] as const;

export default async function CommandCenterPage() {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const tz = ctx.org.timezone;
  const hidden = new Set(((ctx.user.preferences as { hiddenWidgets?: string[] }).hiddenWidgets ?? []) as string[]);
  const show = (w: (typeof WIDGETS)[number]) => !hidden.has(w);

  const [cc, hearing, workload, finance] = await Promise.all([
    commandCenter(ctx),
    nextHearing(ctx),
    show("workload") ? teamWorkload(ctx) : null,
    show("finance") ? financialSnapshot(ctx) : null,
  ]);
  const thresholds = orgThresholds(ctx);
  const now = new Date();
  const hour = zonedParts(now, tz).hour;
  const firstName = (locale === "ar" ? ctx.user.nameAr || ctx.user.name : ctx.user.name).split(" ")[0];
  const greeting = t(hour < 12 ? "dashboard.greetingMorning" : hour < 17 ? "dashboard.greetingAfternoon" : "dashboard.greetingEvening", { name: firstName });
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const b = cc.brief;
  const cur = ctx.org.currency;

  return (
    <Page width="full" className="max-w-[1600px]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-meta text-ink-subtle">
            {formatLongDate(now, locale, tz)}
            <span className="mx-1.5">·</span>
            {formatHijri(now, locale, tz)}
          </p>
          <h1 className="mt-0.5 text-display font-semibold tracking-tight text-ink">{greeting}</h1>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <WidgetCustomizer widgets={[...WIDGETS]} hidden={[...hidden]} />
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/agenda">{t("dashboard.viewAgenda")}</Link>
          </Button>
        </div>
      </header>

      <InlineStats
        className="mt-4 border-y border-line py-2.5"
        items={[
          { key: "h", value: b.hearings, label: t("home.hearings", { n: b.hearings }), href: "/app/agenda" },
          { key: "t", value: cc.tasks.length, label: t("home.tasks", { n: cc.tasks.length }), href: "/app/my-work" },
          { key: "d", value: b.deadlinesIn24h, label: t("home.deadlines", { n: b.deadlinesIn24h }), href: "/app/agenda", tone: b.deadlinesIn24h ? "warning" : undefined },
          ...(ctx.can("approvals.view") ? [{ key: "a", value: cc.approvals.length, label: t("home.approvals", { n: cc.approvals.length }), href: "/app/approvals" }] : []),
          ...(b.overdue ? [{ key: "o", value: b.overdue, label: t("home.overdue"), href: "/app/agenda", tone: "danger" as const }] : []),
        ]}
      />

      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-8 xl:grid-cols-12">
        {/* ── Next hearing — the focal object ─────────────────── */}
        {show("nextHearing") && (
          <section aria-labelledby="nh" className="xl:col-span-7">
            {hearing ? (
              <div className="relative overflow-hidden rounded-lg border border-line bg-canvas">
                <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-ev-hearing" />
                <div className="flex flex-col gap-5 p-5 ps-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 id="nh" className="eyebrow flex items-center gap-1.5">
                        <Gavel className="size-3.5 text-ev-hearing" aria-hidden /> {t("hearingWidget.label")}
                      </h2>
                      <Badge tone={HEARING_STATUS_TONE[hearing.status]}>{t(`enums.hearingStatus.${hearing.status}`)}</Badge>
                    </div>
                    <Link href={`/app/cases/${hearing.matter.id}`} className="mt-2 block text-[17px] font-semibold leading-snug text-ink hover:underline bidi-plain">
                      {L(hearing.matter.title, hearing.matter.titleAr)}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-meta text-ink-subtle">
                      <span className="record-id">{hearing.matter.internalNumber}</span>
                      {hearing.matter.officialCaseNumber && <span className="record-id">· {hearing.matter.officialCaseNumber}</span>}
                      {hearing.sessionType && <span className="bidi-plain">· {hearing.sessionType}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 sm:text-end">
                    <div className="text-meta text-ink-subtle">{t("home.remaining")}</div>
                    <CountdownInline target={hearing.startsAt} thresholds={thresholds} className="mt-0.5 text-[20px] font-semibold" />
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line px-5 py-3.5 ps-6 sm:grid-cols-4">
                  {[
                    [t("home.when"), <span key="w" className="tabular">{formatDate(hearing.startsAt, locale, tz, { weekday: "short", day: "numeric", month: "short", year: undefined })} · {formatTime(hearing.startsAt, locale, tz)}</span>],
                    [t("home.court"), hearing.court ? L(hearing.court.name, hearing.court.nameAr) : "—"],
                    [t("home.room"), hearing.isRemote ? t("hearingWidget.remote") : hearing.courtRoom || "—"],
                    [t("home.lawyer"), hearing.lawyer ? L(hearing.lawyer.name, hearing.lawyer.nameAr) : "—"],
                  ].map(([k, v], i) => (
                    <div key={i} className="min-w-0">
                      <dt className="text-caption text-ink-subtle">{k}</dt>
                      <dd className="mt-0.5 line-clamp-2 text-body text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3 ps-6">
                  <Button asChild variant="primary" size="sm">
                    <Link href={`/app/hearings/${hearing.id}/prepare`}>
                      <ClipboardList /> {t("hearingWidget.prepare")}
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/app/cases/${hearing.matter.id}`}>
                      <ArrowUpRight className="rtl:-scale-x-100" /> {t("hearingWidget.openCase")}
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/app/cases/${hearing.matter.id}/documents`}>
                      <FolderOpen /> {t("hearingWidget.documents")}
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line-strong">
                <EmptyState compact icon={<Gavel />} title={t("home.noHearing")} />
              </div>
            )}
          </section>
        )}

        {/* ── Today — vertical timeline ───────────────────────── */}
        {show("agenda") && (
          <Panel plain title={t("home.timeline")} count={cc.today.length || null} className="xl:col-span-5" actions={<SectionLink href="/app/agenda">{t("common.viewAll")}</SectionLink>}>
            {cc.today.length ? (
              <Timeline
                className="pt-1"
                items={cc.today.map((e) => {
                  const s = EVENT_STYLE[e.eventType] ?? EVENT_STYLE.FOLLOW_UP;
                  return {
                    key: `${e.kind}-${e.id}`,
                    time: formatTime(e.startsAt, locale, tz),
                    color: s.color,
                    href: e.href,
                    title: e.title,
                    meta: (
                      <>
                        <span style={{ color: s.color }}>{t(`enums.eventType.${e.eventType}`)}</span>
                        {e.matter && <span className="record-id text-ink-subtle">· {e.matter.internalNumber}</span>}
                        {(e.person || e.personAr) && <span>· {L(e.person ?? "", e.personAr)}</span>}
                      </>
                    ),
                    trailing: e.needsVerification ? <Badge tone="warning">{t("dashboard.needsVerification")}</Badge> : undefined,
                  };
                })}
              />
            ) : (
              <EmptyState compact icon={<Clock3 />} title={t("home.timelineEmpty")} />
            )}
          </Panel>
        )}

        {/* ── Critical deadlines — compact list ───────────────── */}
        {show("critical") && (
          <Panel plain title={t("dashboard.critical")} count={cc.critical.length || null} className="xl:col-span-7" actions={<SectionLink href="/app/agenda">{t("common.viewAll")}</SectionLink>}>
            {cc.critical.length ? (
              <div role="table" className="text-body">
                <div role="row" className="hidden grid-cols-[minmax(0,1fr)_128px_128px_136px] gap-3 border-b border-line px-3 py-1.5 text-meta text-ink-subtle md:grid">
                  <span role="columnheader">{t("common.title")}</span>
                  <span role="columnheader">{t("home.owner")}</span>
                  <span role="columnheader">{t("home.due")}</span>
                  <span role="columnheader" className="text-end">{t("home.remaining")}</span>
                </div>
                {cc.critical.map((d) => (
                  <Link
                    role="row"
                    key={`${d.kind}-${d.id}`}
                    href={d.href}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-line/70 px-3 py-2 transition-colors last:border-0 hover:bg-surface-muted md:grid-cols-[minmax(0,1fr)_128px_128px_136px]",
                      (d.level === "OVERDUE" || d.level === "IMMEDIATE") && "bg-danger-soft/40",
                    )}
                  >
                    <span role="cell" className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink bidi-plain">{d.kind === "HEARING" ? `${t("enums.eventType.HEARING")} — ${d.title}` : d.title}</span>
                        {d.needsVerification && <Badge tone="warning" className="shrink-0">{t("dashboard.needsVerification")}</Badge>}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-meta text-ink-subtle">
                        {d.matter && <span className="record-id">{d.matter.internalNumber}</span>}
                        <StatusText tone={ALERT_TONE[d.level]} className="text-meta">{t(`enums.alertLevel.${d.level}`)}</StatusText>
                      </span>
                    </span>
                    <span role="cell" className="hidden truncate text-ink-muted md:block">{d.person || d.personAr ? L(d.person ?? "", d.personAr) : "—"}</span>
                    <span role="cell" className="hidden whitespace-nowrap tabular text-ink-muted md:block">{formatDate(d.at, locale, tz, { day: "numeric", month: "short", year: undefined })} · {formatTime(d.at, locale, tz)}</span>
                    <span role="cell" className="whitespace-nowrap text-end">
                      <CountdownInline target={d.at} thresholds={thresholds} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState compact icon={<CalendarClock />} title={t("dashboard.criticalEmpty")} />
            )}
          </Panel>
        )}

        {/* ── Tasks + approvals ───────────────────────────────── */}
        <div className="flex flex-col gap-8 xl:col-span-5">
          {show("tasks") && (
            <Panel plain title={t("dashboard.tasks")} count={cc.tasks.length || null} actions={<SectionLink href="/app/my-work">{t("nav.myWork")}</SectionLink>}>
              {cc.tasks.length ? (
                <ul>
                  {cc.tasks.slice(0, 6).map((task) => (
                    <li key={task.id}>
                      <Link href={`/app/tasks?task=${task.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted">
                        <Circle className={cn("size-4 shrink-0", task.priority === "CRITICAL" ? "text-critical" : task.priority === "HIGH" ? "text-high" : "text-line-strong")} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-ink bidi-plain">{task.title}</span>
                          {task.matter && <span className="record-id block truncate text-ink-subtle">{task.matter.internalNumber}</span>}
                        </span>
                        {task.dueAt && (
                          <span className={cn("shrink-0 text-meta tabular", task.overdue ? "font-medium text-danger" : "text-ink-muted")}>
                            {task.overdue ? t("common.overdue") : formatTime(task.dueAt, locale, tz)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={<CheckSquare />} title={t("dashboard.tasksEmpty")} />
              )}
            </Panel>
          )}

          {show("approvals") && ctx.can("approvals.view") && (
            <Panel plain title={t("dashboard.approvals")} count={cc.approvals.length || null} className="hidden md:block" actions={<SectionLink href="/app/approvals">{t("common.viewAll")}</SectionLink>}>
              {cc.approvals.length ? (
                <ul>
                  {cc.approvals.slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-muted">
                      <ShieldCheck className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body text-ink bidi-plain">{a.title}</div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-meta text-ink-subtle">
                          <span>{t(`approvals.kind.${a.kind}`)}</span>
                          {a.matter && <span className="record-id">· {a.matter.internalNumber}</span>}
                          {a.requestedBy && <span>· {L(a.requestedBy.name, a.requestedBy.nameAr)}</span>}
                          <span>· {relativeTime(a.createdAt, locale)}</span>
                        </div>
                      </div>
                      <Button asChild size="xs" variant="secondary">
                        <Link href={`/app/approvals?focus=${a.id}`}>{t("home.review")}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={<ShieldCheck />} title={t("dashboard.approvalsEmpty")} />
              )}
            </Panel>
          )}
        </div>

        {/* ── Recent activity | Team workload ─────────────────── */}
        {show("activity") && (
          <Panel plain title={t("home.recent")} className="hidden md:block xl:col-span-7">
            {cc.activity.length ? (
              <ul>
                {cc.activity.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-3 py-2">
                    <Avatar name={a.actor?.name ?? "System"} size={22} className="mt-0.5" />
                    <div className="min-w-0 flex-1 text-body">
                      {a.matter && (
                        <Link href={`/app/cases/${a.matter.id}`} className="block truncate font-medium text-ink hover:underline bidi-plain">
                          {L(a.matter.title, a.matter.titleAr)}
                        </Link>
                      )}
                      <div className="truncate text-meta text-ink-muted">
                        <span className="text-ink">{a.actor ? L(a.actor.name, a.actor.nameAr) : "—"}</span> {t(`activity.${a.type}`, a.data)}
                      </div>
                    </div>
                    <time className="shrink-0 pt-0.5 text-meta text-ink-subtle" dateTime={a.createdAt}>{relativeTime(a.createdAt, locale)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Activity />} title={t("dashboard.activityEmpty")} />
            )}
          </Panel>
        )}

        {show("workload") && workload && (
          <Panel plain title={t("home.workload")} className="hidden md:block xl:col-span-5" actions={<SectionLink href="/app/team">{t("nav.team")}</SectionLink>}
            footer={<p className="px-3 text-caption text-ink-subtle">{t("dashboard.workloadNote")}</p>}>
            <table className="w-full text-body">
              <thead>
                <tr className="text-meta text-ink-subtle">
                  <th className="px-3 py-1.5 text-start font-medium">{t("common.name")}</th>
                  <th className="px-2 py-1.5 text-end font-medium">{t("nav.cases")}</th>
                  <th className="px-2 py-1.5 text-end font-medium">{t("nav.tasks")}</th>
                  <th className="px-2 py-1.5 text-end font-medium">{t("dashboard.urgentTasks")}</th>
                  <th className="w-24 px-3 py-1.5"><span className="sr-only">{t("home.workload")}</span></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const max = Math.max(...workload.map((x) => x.activeMatters + x.openTasks), 1);
                  return workload.map((u) => {
                    const load = u.activeMatters + u.openTasks;
                    return (
                      <tr key={u.id} className="border-t border-line/70">
                        <td className="px-3 py-2">
                          <Link href={`/app/team/${u.id}`} className="flex items-center gap-2 hover:underline">
                            <Avatar name={u.name} src={u.photoUrl} size={22} />
                            <span className="truncate">{L(u.name, u.nameAr)}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-end tabular text-ink-muted">{u.activeMatters}</td>
                        <td className="px-2 py-2 text-end tabular text-ink-muted">{u.openTasks}</td>
                        <td className={cn("px-2 py-2 text-end tabular", u.urgentTasks ? "font-medium text-high" : "text-ink-subtle")}>{u.urgentTasks}</td>
                        <td className="px-3 py-2">
                          <div className="h-1 overflow-hidden rounded-full bg-surface-sunken" role="presentation">
                            <div className="h-full rounded-full bg-ink-subtle" style={{ width: `${(load / max) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </Panel>
        )}

        {/* ── Financial snapshot — one strip ──────────────────── */}
        {show("finance") && finance && (
          <section aria-labelledby="fin" className="hidden md:block xl:col-span-12">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 id="fin" className="flex items-center gap-2 text-body font-semibold text-ink">
                <Wallet className="size-3.5 text-ink-subtle" aria-hidden /> {t("home.money")}
              </h2>
              <SectionLink href="/app/finance">{t("nav.finance")}</SectionLink>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 pt-3 lg:grid-cols-4">
              {[
                { label: t("dashboard.outstanding"), value: formatMoney(finance.outstanding, locale, cur), sub: t("common.items", { n: finance.outstandingCount }) },
                { label: t("dashboard.overdueInvoices"), value: formatMoney(finance.overdue, locale, cur), sub: t("common.items", { n: finance.overdueCount }), tone: finance.overdue > 0 ? "text-danger" : "" },
                { label: t("dashboard.receivedMonth"), value: formatMoney(finance.receivedThisMonth, locale, cur) },
                { label: t("dashboard.unbilled"), value: formatMoney(finance.unbilledValue, locale, cur), sub: formatMinutes(finance.unbilledMinutes, locale) },
              ].map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-meta text-ink-subtle">{f.label}</dt>
                  <dd className={cn("mt-0.5 text-[17px] font-semibold tabular text-ink", f.tone)}>
                    <span className="ltr-nums">{f.value}</span>
                    {f.sub && <span className="ms-2 text-meta font-normal text-ink-subtle">{f.sub}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

      </div>
    </Page>
  );
}

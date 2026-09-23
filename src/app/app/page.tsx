import Link from "next/link";
import { ArrowRight, ArrowLeft, Gavel, CalendarClock, CheckSquare, Activity, ShieldCheck, Briefcase, UsersRound, Wallet, AlertTriangle, FolderOpen, ClipboardList, Clock3 } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { commandCenter, financialSnapshot, nextHearing, orgThresholds, teamWorkload } from "@/server/services/dashboard";
import { Panel, EmptyState, Avatar } from "@/components/ui/layout";
import { Badge, ALERT_TONE, PRIORITY_TONE, HEARING_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountdownBlocks, CountdownInline } from "@/components/countdown";
import { EventRow } from "@/components/events";
import { formatHijri, formatLongDate, formatMoney, formatMinutes, formatTime, formatDate, relativeTime, zonedParts } from "@/lib/time";
import { cn } from "@/lib/utils";
import { WidgetCustomizer } from "./widget-customizer";

export const metadata = { title: "Command Center" };

const WIDGETS = ["nextHearing", "critical", "agenda", "tasks", "activity", "approvals", "portfolio", "workload", "finance"] as const;

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
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);

  const b = cc.brief;
  const briefItems = [
    { n: b.hearings, key: "dashboard.briefHearings", icon: Gavel, tone: "text-ev-hearing", href: "/app/agenda" },
    { n: b.appointments, key: "dashboard.briefAppointments", icon: UsersRound, tone: "text-ev-client-meeting", href: "/app/agenda" },
    { n: b.tasksForReview, key: "dashboard.briefTasks", icon: CheckSquare, tone: "text-info", href: "/app/my-work" },
    { n: b.submissionsDue, key: "dashboard.briefSubmissions", icon: FolderOpen, tone: "text-ev-submission", href: "/app/agenda" },
    { n: b.deadlinesIn24h, key: "dashboard.briefDeadlines", icon: CalendarClock, tone: "text-high", href: "/app/agenda" },
    { n: b.approvals, key: "dashboard.briefApprovals", icon: ShieldCheck, tone: "text-accent", href: "/app/approvals" },
    { n: b.overdue, key: "dashboard.briefOverdue", icon: AlertTriangle, tone: "text-danger", href: "/app/agenda" },
  ].filter((i) => i.n > 0);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Morning legal brief ─────────────────────────────── */}
      <section aria-labelledby="brief" className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-subtle">
            {formatLongDate(now, locale, tz)}
            <span className="mx-1.5 text-line-strong">·</span>
            <span>{formatHijri(now, locale, tz)}</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{greeting}</h1>
          <h2 id="brief" className="sr-only">{t("dashboard.briefTitle")}</h2>
          {briefItems.length ? (
            <div className="mt-4">
              <p className="mb-2.5 text-sm text-ink-muted">{t("dashboard.briefIntro")}</p>
              <ul className="flex flex-wrap gap-2">
                {briefItems.map((i) => (
                  <li key={i.key}>
                    <Link href={i.href} className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink shadow-xs transition-colors hover:border-line-strong hover:bg-surface-muted">
                      <i.icon className={cn("size-4", i.tone)} aria-hidden />
                      {t(i.key, { n: i.n })}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">{t("dashboard.briefClear")}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <WidgetCustomizer widgets={[...WIDGETS]} hidden={[...hidden]} />
          <Button asChild variant="primary">
            <Link href="/app/agenda">
              {t("dashboard.viewAgenda")} <Arrow />
            </Link>
          </Button>
        </div>
      </section>

      <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ── Next hearing (prominent) ───────────────────────── */}
        {show("nextHearing") && (
          <section className="relative overflow-hidden rounded-lg bg-nav text-nav-fg shadow-md lg:col-span-5" aria-labelledby="nh-title">
            <div className="absolute inset-y-0 start-0 w-1 bg-[var(--ev-hearing)]" aria-hidden />
            {hearing ? (
              <div className="flex h-full flex-col p-5 ps-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="nh-title" className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-nav-muted">
                    <Gavel className="size-4" /> {t("hearingWidget.label")}
                  </h2>
                  <Badge tone={HEARING_STATUS_TONE[hearing.status]}>{t(`enums.hearingStatus.${hearing.status}`)}</Badge>
                </div>
                <Link href={`/app/cases/${hearing.matter.id}`} className="mt-3 block text-lg font-semibold leading-snug text-white hover:underline">
                  {L(hearing.matter.title, hearing.matter.titleAr)}
                </Link>
                <div className="ltr-nums mt-1 font-mono text-[12px] text-nav-muted">
                  {hearing.matter.internalNumber}
                  {hearing.matter.officialCaseNumber && ` · ${hearing.matter.officialCaseNumber}`}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                  <div>
                    <dt className="text-[11px] text-nav-muted">{t("hearings.court")}</dt>
                    <dd className="truncate text-white">{hearing.court ? L(hearing.court.name, hearing.court.nameAr) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-nav-muted">{t("common.date")}</dt>
                    <dd className="text-white">
                      {formatDate(hearing.startsAt, locale, tz, { day: "numeric", month: "long", year: "numeric" })} — {formatTime(hearing.startsAt, locale, tz)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-nav-muted">{t("hearings.room")}</dt>
                    <dd className="text-white">{hearing.isRemote ? t("hearingWidget.remote") : hearing.courtRoom || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-nav-muted">{t("hearings.lawyer")}</dt>
                    <dd className="truncate text-white">{hearing.lawyer ? L(hearing.lawyer.name, hearing.lawyer.nameAr) : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                  <CountdownBlocks target={hearing.startsAt} thresholds={thresholds} dark />
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-nav-line pt-4">
                  <Button asChild size="sm" className="border-transparent bg-white text-[#0c1424] hover:bg-white/90">
                    <Link href={`/app/hearings/${hearing.id}/prepare`}>
                      <ClipboardList /> {t("hearingWidget.prepare")}
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="text-nav-fg hover:bg-nav-surface hover:text-white">
                    <Link href={`/app/cases/${hearing.matter.id}`}>{t("hearingWidget.openCase")}</Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="text-nav-fg hover:bg-nav-surface hover:text-white">
                    <Link href={`/app/cases/${hearing.matter.id}/documents`}>{t("hearingWidget.documents")}</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-48 flex-col items-center justify-center p-6 text-center">
                <Gavel className="size-6 text-nav-muted" />
                <p className="mt-2 text-sm text-nav-fg">{t("hearingWidget.none")}</p>
              </div>
            )}
          </section>
        )}

        {/* ── Critical deadlines ─────────────────────────────── */}
        {show("critical") && (
          <Panel title={t("dashboard.critical")} icon={<CalendarClock />} className={cn(show("nextHearing") ? "lg:col-span-7" : "lg:col-span-12")} id="critical"
            actions={<Link href="/app/agenda" className="text-xs font-medium text-ink-muted hover:text-ink">{t("common.viewAll")}</Link>}>
            {cc.critical.length ? (
              <ul className="divide-y divide-line">
                {cc.critical.map((d) => (
                  <li key={`${d.kind}-${d.id}`}>
                    <Link href={d.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted/60">
                      <Badge tone={ALERT_TONE[d.level]} className="w-[88px] justify-center">{t(`enums.alertLevel.${d.level}`)}</Badge>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-ink">{d.kind === "HEARING" ? `${t("enums.eventType.HEARING")} — ${d.title}` : d.title}</span>
                          {d.needsVerification && <Badge tone="warning">{t("dashboard.needsVerification")}</Badge>}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-ink-muted">
                          {d.matter && <span className="ltr-nums font-mono text-[11.5px] text-ink-subtle">{d.matter.internalNumber}</span>}
                          {d.matter && " · "}
                          {formatDate(d.at, locale, tz)} {formatTime(d.at, locale, tz)}
                          {(d.person || d.personAr) && ` · ${L(d.person ?? "", d.personAr)}`}
                        </div>
                      </div>
                      <CountdownInline target={d.at} thresholds={thresholds} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<CalendarClock />} title={t("dashboard.criticalEmpty")} />
            )}
          </Panel>
        )}

        {/* ── Today's agenda ─────────────────────────────────── */}
        {show("agenda") && (
          <Panel title={t("dashboard.agenda")} icon={<Clock3 />} className="lg:col-span-7" id="agenda"
            actions={<Link href="/app/agenda" className="text-xs font-medium text-ink-muted hover:text-ink">{t("common.viewAll")}</Link>}>
            {cc.today.length ? (
              <ul className="divide-y divide-line">
                {cc.today.map((e) => (
                  <li key={`${e.kind}-${e.id}`}>
                    <EventRow e={{ ...e, title: e.kind === "HEARING" ? `${e.title}` : e.title }} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Clock3 />} title={t("dashboard.agendaEmpty")} />
            )}
          </Panel>
        )}

        {/* ── Tasks requiring attention ──────────────────────── */}
        {show("tasks") && (
          <Panel title={t("dashboard.tasks")} icon={<CheckSquare />} className="lg:col-span-5" id="tasks"
            actions={<Link href="/app/my-work" className="text-xs font-medium text-ink-muted hover:text-ink">{t("nav.myWork")}</Link>}>
            {cc.tasks.length ? (
              <ul className="divide-y divide-line">
                {cc.tasks.map((task) => (
                  <li key={task.id}>
                    <Link href={`/app/tasks?task=${task.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted/60">
                      <span className={cn("size-2 shrink-0 rounded-full", task.priority === "CRITICAL" ? "bg-critical" : task.priority === "HIGH" ? "bg-high" : "bg-line-strong")} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink">{task.title}</div>
                        <div className="mt-0.5 truncate text-[12px] text-ink-muted">
                          {task.matter && <span className="ltr-nums font-mono text-[11.5px] text-ink-subtle">{task.matter.internalNumber}</span>}
                          {task.assignee && task.assignee.id !== ctx.user.id && ` · ${L(task.assignee.name, task.assignee.nameAr)}`}
                        </div>
                      </div>
                      {task.dueAt && (
                        <span className={cn("shrink-0 text-[12px] tabular", task.overdue ? "font-medium text-danger" : "text-ink-muted")}>
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

        {/* ── Recent activity ────────────────────────────────── */}
        {show("activity") && (
          <Panel title={t("dashboard.activity")} icon={<Activity />} className="lg:col-span-7" id="activity">
            {cc.activity.length ? (
              <ul className="divide-y divide-line">
                {cc.activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                    <Avatar name={a.actor?.name ?? "System"} size={24} className="mt-0.5" />
                    <div className="min-w-0 flex-1 text-[13px]">
                      <span className="font-medium text-ink">{a.actor ? L(a.actor.name, a.actor.nameAr) : "—"}</span>{" "}
                      <span className="text-ink-muted">{t(`activity.${a.type}`, a.data)}</span>
                      {a.matter && (
                        <Link href={`/app/cases/${a.matter.id}`} className="mt-0.5 block truncate text-[12px] text-ink-subtle hover:text-ink hover:underline">
                          <span className="ltr-nums font-mono">{a.matter.internalNumber}</span> · {L(a.matter.title, a.matter.titleAr)}
                        </Link>
                      )}
                    </div>
                    <time className="shrink-0 text-[11.5px] text-ink-subtle" dateTime={a.createdAt}>{relativeTime(a.createdAt, locale)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Activity />} title={t("dashboard.activityEmpty")} />
            )}
          </Panel>
        )}

        {/* ── Approvals ──────────────────────────────────────── */}
        {show("approvals") && ctx.can("approvals.view") && (
          <Panel title={t("dashboard.approvals")} icon={<ShieldCheck />} className="lg:col-span-5" id="approvals"
            actions={<Link href="/app/approvals" className="text-xs font-medium text-ink-muted hover:text-ink">{t("common.viewAll")}</Link>}>
            {cc.approvals.length ? (
              <ul className="divide-y divide-line">
                {cc.approvals.map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/approvals?focus=${a.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted/60">
                      <Badge tone="info" className="shrink-0">{t(`approvals.kind.${a.kind}`)}</Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink">{a.title}</div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[12px] text-ink-muted">
                          {a.matter && <span className="ltr-nums font-mono text-[11.5px]">{a.matter.internalNumber}</span>}
                          {a.requestedBy && <span>· {L(a.requestedBy.name, a.requestedBy.nameAr)}</span>}
                          <span>· {relativeTime(a.createdAt, locale)}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<ShieldCheck />} title={t("dashboard.approvalsEmpty")} />
            )}
          </Panel>
        )}

        {/* ── Portfolio ─────────────────────────────────────── */}
        {show("portfolio") && (
          <Panel title={t("dashboard.portfolio")} icon={<Briefcase />} className="lg:col-span-4" id="portfolio"
            actions={<Link href="/app/cases" className="text-xs font-medium text-ink-muted hover:text-ink">{t("nav.cases")}</Link>}>
            <div className="grid grid-cols-3 divide-x divide-line border-b border-line rtl:divide-x-reverse">
              {(["ACTIVE", "PENDING", "CLOSED"] as const).map((s) => (
                <Link key={s} href={`/app/cases?status=${s}`} className="px-4 py-3 hover:bg-surface-muted/60">
                  <div className="text-[11.5px] text-ink-subtle">{t(`enums.matterStatus.${s}`)}</div>
                  <div className="mt-0.5 text-xl font-semibold tabular text-ink">{cc.portfolio.byStatus[s] ?? 0}</div>
                </Link>
              ))}
            </div>
            <div className="px-4 pb-1 pt-3 text-[11.5px] font-medium text-ink-subtle">{t("dashboard.atRisk")}</div>
            {cc.portfolio.atRisk.length ? (
              <ul className="pb-2">
                {cc.portfolio.atRisk.map((m) => (
                  <li key={m.id}>
                    <Link href={`/app/cases/${m.id}`} className="flex items-center gap-2 px-4 py-1.5 hover:bg-surface-muted/60">
                      <Badge tone={PRIORITY_TONE[m.priority]} className="shrink-0">{t(`enums.priority.${m.priority}`)}</Badge>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{L(m.title, m.titleAr)}</span>
                    </Link>
                    {m.riskFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-4 pb-1.5 ps-[76px]">
                        {m.riskFlags.map((f) => (
                          <span key={f} className="text-[11px] text-ink-subtle">• {t(`enums.riskFlag.${f}`)}</span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-3 text-[13px] text-ink-muted">{t("dashboard.atRiskEmpty")}</p>
            )}
            {cc.portfolio.inactive > 0 && (
              <Link href="/app/cases?view=inactive" className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-muted hover:bg-surface-muted/60">
                {t("dashboard.inactive")}
                <Badge tone="warning">{cc.portfolio.inactive}</Badge>
              </Link>
            )}
          </Panel>
        )}

        {/* ── Team workload ─────────────────────────────────── */}
        {show("workload") && workload && (
          <Panel title={t("dashboard.workload")} icon={<UsersRound />} className={cn(finance ? "lg:col-span-5" : "lg:col-span-8")} id="workload"
            footer={<p className="text-[11.5px] text-ink-subtle">{t("dashboard.workloadNote")}</p>}>
            <ul className="divide-y divide-line">
              {workload.map((u) => {
                const max = Math.max(...workload.map((x) => x.activeMatters + x.openTasks), 1);
                const load = u.activeMatters + u.openTasks;
                return (
                  <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={u.name} src={u.photoUrl} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">{L(u.name, u.nameAr)}</span>
                        <span className="shrink-0 text-[11.5px] tabular text-ink-muted">
                          {u.activeMatters} {t("dashboard.activeMatters")} · {u.openTasks} {t("dashboard.openTasks")}
                          {u.urgentTasks > 0 && <span className="text-high"> · {u.urgentTasks} {t("dashboard.urgentTasks")}</span>}
                          {u.hearings7d > 0 && <span> · {u.hearings7d} {t("dashboard.hearings7d")}</span>}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="presentation">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(load / max) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {/* ── Financial snapshot ────────────────────────────── */}
        {show("finance") && finance && (
          <Panel title={t("dashboard.finance")} icon={<Wallet />} className="lg:col-span-3" id="finance"
            actions={<Link href="/app/finance" className="text-xs font-medium text-ink-muted hover:text-ink">{t("nav.finance")}</Link>}>
            <dl className="divide-y divide-line">
              {[
                [t("dashboard.outstanding"), formatMoney(finance.outstanding, locale, ctx.org.currency), `${finance.outstandingCount}`, ""],
                [t("dashboard.overdueInvoices"), formatMoney(finance.overdue, locale, ctx.org.currency), `${finance.overdueCount}`, finance.overdue > 0 ? "text-danger" : ""],
                [t("dashboard.receivedMonth"), formatMoney(finance.receivedThisMonth, locale, ctx.org.currency), "", "text-success"],
                [t("dashboard.unbilled"), formatMoney(finance.unbilledValue, locale, ctx.org.currency), formatMinutes(finance.unbilledMinutes, locale), ""],
              ].map(([label, value, sub, tone]) => (
                <div key={label} className="px-4 py-2.5">
                  <dt className="text-[11.5px] text-ink-subtle">{label}</dt>
                  <dd className={cn("mt-0.5 flex items-baseline justify-between gap-2 text-[15px] font-semibold tabular text-ink", tone)}>
                    <span className="ltr-nums">{value}</span>
                    {sub && <span className="text-[11.5px] font-normal text-ink-subtle">{sub}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}
      </div>
    </div>
  );
}

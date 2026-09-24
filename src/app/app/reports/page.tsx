import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Briefcase, Users, UsersRound, Wallet, FileText } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { buildReport, REPORT_PERIODS, type ReportRow } from "@/server/services/reports";
import { Page, PageHeader, Panel, EmptyState, Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatMoney, formatMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

const CATS = [
  { key: "cases", icon: Briefcase, label: "nav.cases" },
  { key: "clients", icon: Users, label: "nav.clients" },
  { key: "team", icon: UsersRound, label: "nav.team" },
  { key: "finance", icon: Wallet, label: "nav.finance" },
  { key: "documents", icon: FileText, label: "nav.documents" },
] as const;

function Bars({ rows, locale, none, notSet }: { rows: ReportRow[]; locale: string; none: string; notSet: string }) {
  if (!rows.length) return <EmptyState compact title={none} />;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-2.5 pt-2">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,180px)_1fr_40px] items-center gap-3 text-body">
          <span className="truncate text-ink-muted">{r.label === "—" ? notSet : locale === "ar" ? (r.labelAr ?? r.label) : r.label}</span>
          <span className="h-2 overflow-hidden rounded-sm bg-surface-sunken"><span className="block h-full rounded-sm bg-ink-subtle" style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="text-end font-medium tabular text-ink">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Figures({ items }: { items: { label: string; value: React.ReactNode; tone?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-line py-3 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="truncate text-meta text-ink-subtle">{i.label}</dt>
          <dd className={cn("mt-0.5 text-[18px] font-semibold leading-7 tabular text-ink", i.tone)}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; cat?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("reports.view")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const period = (REPORT_PERIODS as readonly string[]).includes(sp.period ?? "") ? sp.period! : "30";
  const r = await buildReport(ctx, Number(period));
  const cats = CATS.filter((c) => (c.key !== "finance" || r.finance) && (c.key !== "clients" || r.clients) && (c.key !== "team" || r.workload));
  const cat = cats.find((c) => c.key === sp.cat)?.key ?? "cases";
  const none = t("reports.none");
  const notSet = t("common.notSet");
  const href = (patch: Record<string, string>) => `/app/reports?${new URLSearchParams({ period, cat, ...patch })}`;

  return (
    <Page width="full" className="max-w-[1440px]">
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        actions={<Button asChild variant="secondary"><a href={`/api/reports/export?period=${period}`}><Download /> {t("reports.export")}</a></Button>}
      />

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label={t("reports.title")} className="flex gap-1 overflow-x-auto scrollbar-none lg:block lg:space-y-0.5">
          {cats.map((c) => (
            <Link key={c.key} href={href({ cat: c.key })} aria-current={cat === c.key ? "page" : undefined} className={cn("flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-body transition-colors", cat === c.key ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
              <c.icon className="size-4 text-ink-subtle" aria-hidden />
              {t(c.label)}
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          <div role="radiogroup" aria-label={t("reports.period")} className="inline-flex items-center rounded-md border border-line bg-surface-muted p-0.5">
            {REPORT_PERIODS.map((p) => (
              <Link key={p} href={href({ period: p })} role="radio" aria-checked={period === p} className={cn("inline-flex h-7 items-center rounded-[5px] px-2.5 text-body font-medium transition-colors", period === p ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-subtle hover:text-ink")}>
                {t(`reports.periods.${p}`)}
              </Link>
            ))}
          </div>

          <div className="mt-5 space-y-8">
            {cat === "cases" && (
              <>
                <Figures items={[
                  { label: t("reports.activeCases"), value: r.kpis.activeCases },
                  { label: t("reports.closedCases"), value: r.kpis.closedCases },
                  { label: t("reports.upcomingHearings"), value: r.kpis.upcomingHearings },
                  { label: t("reports.upcomingDeadlines"), value: r.kpis.upcomingDeadlines },
                  { label: t("reports.overdueTasks"), value: r.kpis.overdueTasks, tone: r.kpis.overdueTasks ? "text-danger" : "" },
                ]} />
                <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
                  <Panel plain title={t("reports.byType")}><Bars rows={r.byType} locale={locale} none={none} notSet={notSet} /></Panel>
                  <Panel plain title={t("reports.byCourt")}><Bars rows={r.byCourt} locale={locale} none={none} notSet={notSet} /></Panel>
                  <Panel plain title={t("reports.byLawyer")}><Bars rows={r.byLawyer} locale={locale} none={none} notSet={notSet} /></Panel>
                </div>
              </>
            )}

            {cat === "clients" && r.clients && (
              <>
                <Figures items={[{ label: t("reports.newClients"), value: r.clients.newClients }]} />
                <Panel plain title={t("reports.clientSources")} className="max-w-2xl">
                  <Bars rows={r.clients.sources.map((x) => ({ ...x, label: x.label === "—" ? "—" : t(`clients.sources.${x.label}`) }))} locale={locale} none={none} notSet={notSet} />
                </Panel>
              </>
            )}

            {cat === "team" && r.workload && (
              <Panel plain title={t("reports.workload")} footer={<p className="text-caption text-ink-subtle">{t("dashboard.workloadNote")}</p>}>
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("common.name")}</TH>
                      <TH className="text-end">{t("reports.activeCases")}</TH>
                      <TH className="text-end">{t("nav.tasks")}</TH>
                      <TH className="text-end">{t("dashboard.urgentTasks")}</TH>
                      <TH className="text-end">{t("dashboard.hearings7d")}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {r.workload.map((u) => (
                      <TR key={u.id}>
                        <TD><Link href={`/app/team/${u.id}`} className="flex items-center gap-2 font-medium text-ink hover:underline"><Avatar name={u.name} size={20} />{locale === "ar" ? (u.nameAr ?? u.name) : u.name}</Link></TD>
                        <TD className="text-end tabular">{u.activeMatters}</TD>
                        <TD className="text-end tabular">{u.openTasks}</TD>
                        <TD className={cn("text-end tabular", u.urgentTasks ? "font-medium text-high" : "text-ink-subtle")}>{u.urgentTasks}</TD>
                        <TD className="text-end tabular">{u.hearings7d}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </Panel>
            )}

            {cat === "finance" && r.finance && (
              <Figures items={[
                { label: t("reports.revenue"), value: <span className="ltr-nums">{formatMoney(r.finance.revenue - r.finance.refunds, locale, r.finance.currency)}</span>, tone: "text-success" },
                { label: t("reports.outstanding"), value: <span className="ltr-nums">{formatMoney(r.finance.outstanding, locale, r.finance.currency)}</span>, tone: r.finance.outstanding ? "text-warning" : "" },
                { label: t("reports.expenses"), value: <span className="ltr-nums">{formatMoney(r.finance.expenses, locale, r.finance.currency)}</span> },
                { label: t("reports.time"), value: formatMinutes(r.finance.minutes, locale) },
              ]} />
            )}

            {cat === "documents" && (
              <Panel plain title={t("reports.documentActivity")} className="max-w-2xl">
                <Bars rows={r.documents.map((d) => ({ ...d, label: t(`enums.documentStatus.${d.label}`) }))} locale={locale} none={none} notSet={notSet} />
              </Panel>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

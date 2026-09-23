import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, BarChart3, Wallet, UsersRound } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { buildReport, REPORT_PERIODS, type ReportRow } from "@/server/services/reports";
import { PageHeader, Panel, Stat, LinkTabs, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { formatMoney, formatMinutes } from "@/lib/time";

export const metadata = { title: "Reports" };

function Bars({ rows, locale, none, notSet }: { rows: ReportRow[]; locale: string; none: string; notSet?: string }) {
  if (!rows.length) return <EmptyState compact title={none} />;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-2.5 p-4">
      {rows.map((r, i) => (
        <li key={i} className="text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-ink">{r.label === "—" ? notSet : locale === "ar" ? (r.labelAr ?? r.label) : r.label}</span>
            <span className="ltr-nums tabular font-medium text-ink">{r.count}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("reports.view")) notFound();
  const { t, locale } = await getT();
  const { period: raw } = await searchParams;
  const period = (REPORT_PERIODS as readonly string[]).includes(raw ?? "") ? raw! : "30";
  const r = await buildReport(ctx, Number(period));
  const none = t("reports.none");
  const notSet = t("common.notSet");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        actions={<Button asChild variant="secondary"><a href={`/api/reports/export?period=${period}`}><Download /> {t("reports.export")}</a></Button>}
      />
      <div className="mt-4 border-b border-line">
        <LinkTabs active={period} tabs={REPORT_PERIODS.map((p) => ({ key: p, href: `/app/reports?period=${p}`, label: t(`reports.periods.${p}`) }))} />
      </div>

      <Panel className="mt-5" bodyClassName="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("reports.activeCases")} value={r.kpis.activeCases} />
        <Stat label={t("reports.closedCases")} value={r.kpis.closedCases} />
        <Stat label={t("reports.upcomingHearings")} value={r.kpis.upcomingHearings} />
        <Stat label={t("reports.upcomingDeadlines")} value={r.kpis.upcomingDeadlines} />
        <Stat label={t("reports.overdueTasks")} value={r.kpis.overdueTasks} tone={r.kpis.overdueTasks ? "danger" : undefined} />
        {r.clients && <Stat label={t("reports.newClients")} value={r.clients.newClients} />}
      </Panel>

      {r.finance && (
        <Panel className="mt-5" title={t("nav.finance")} icon={<Wallet />} bodyClassName="grid grid-cols-2 gap-5 p-5 lg:grid-cols-4">
          <Stat label={t("reports.revenue")} value={<span className="ltr-nums">{formatMoney(r.finance.revenue - r.finance.refunds, locale, r.finance.currency)}</span>} tone="success" />
          <Stat label={t("reports.outstanding")} value={<span className="ltr-nums">{formatMoney(r.finance.outstanding, locale, r.finance.currency)}</span>} sub={t("common.items", { n: r.finance.outstandingCount })} tone={r.finance.outstanding ? "warning" : undefined} />
          <Stat label={t("reports.expenses")} value={<span className="ltr-nums">{formatMoney(r.finance.expenses, locale, r.finance.currency)}</span>} />
          <Stat label={t("reports.time")} value={formatMinutes(r.finance.minutes, locale)} />
        </Panel>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Panel title={t("reports.byType")} icon={<BarChart3 />}><Bars rows={r.byType} locale={locale} none={none} notSet={notSet} /></Panel>
        <Panel title={t("reports.byCourt")} icon={<BarChart3 />}><Bars rows={r.byCourt} locale={locale} none={none} notSet={notSet} /></Panel>
        <Panel title={t("reports.byLawyer")} icon={<BarChart3 />}><Bars rows={r.byLawyer} locale={locale} none={none} notSet={notSet} /></Panel>
        {r.clients && <Panel title={t("reports.clientSources")} icon={<BarChart3 />}><Bars rows={r.clients.sources.map((x) => ({ ...x, label: x.label === "—" ? t("common.notSet") : t(`clients.sources.${x.label}`) }))} locale={locale} none={none} notSet={notSet} /></Panel>}
        <Panel title={t("reports.documentActivity")} icon={<BarChart3 />}><Bars rows={r.documents.map((d) => ({ ...d, label: t(`enums.documentStatus.${d.label}`) }))} locale={locale} none={none} notSet={notSet} /></Panel>
      </div>

      {r.workload && (
        <Panel className="mt-5" title={t("reports.workload")} icon={<UsersRound />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-[12px] text-ink-subtle">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-start font-medium">{t("common.name")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("reports.activeCases")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("nav.tasks")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("dashboard.urgentTasks")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("dashboard.hearings7d")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.workload.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5"><Link href={`/app/team/${u.id}`} className="font-medium text-ink hover:underline">{locale === "ar" ? (u.nameAr ?? u.name) : u.name}</Link></td>
                    <td className="ltr-nums tabular px-4 py-2.5 text-end">{u.activeMatters}</td>
                    <td className="ltr-nums tabular px-4 py-2.5 text-end">{u.openTasks}</td>
                    <td className="ltr-nums tabular px-4 py-2.5 text-end">{u.urgentTasks}</td>
                    <td className="ltr-nums tabular px-4 py-2.5 text-end">{u.hearings7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

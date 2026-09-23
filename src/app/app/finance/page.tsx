import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Wallet, Receipt, Clock3, CreditCard } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { financeOverview } from "@/server/services/finance-queries";
import { financialSnapshot } from "@/server/services/dashboard";
import { PageHeader, Panel, EmptyState, LinkTabs } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge, INVOICE_STATUS_TONE } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatDate, formatMinutes, formatMoney } from "@/lib/time";
import { ExpenseButton } from "./forms";

export const metadata = { title: "Finance" };
const TABS = ["overview", "invoices", "payments", "expenses", "time"] as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("finance.view") && !ctx.can("time.track")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : ctx.can("finance.view") ? "overview" : "time";
  const [data, snap] = await Promise.all([financeOverview(ctx, tab, { status: sp.status, client: sp.client }), tab === "overview" ? financialSnapshot(ctx) : null]);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const cur = ctx.org.currency;
  const tz = ctx.org.timezone;
  const now = new Date();

  const invoiceTable = (rows: typeof data.invoices) =>
    rows.length === 0 ? <EmptyState icon={<Receipt />} title={t("finance.emptyInvoices")} body={t("finance.emptyInvoicesBody")} /> : (
      <Table>
        <THead><tr><TH>{t("finance.number")}</TH><TH>{t("finance.client")}</TH><TH className="hidden md:table-cell">{t("finance.matter")}</TH><TH className="hidden sm:table-cell">{t("finance.dueDate")}</TH><TH className="text-end">{t("finance.total")}</TH><TH className="text-end">{t("finance.due")}</TH><TH>{t("finance.status")}</TH></tr></THead>
        <tbody>
          {rows.map((i) => {
            const due = Number(i.total) - Number(i.amountPaid);
            const late = ["ISSUED", "PARTIALLY_PAID"].includes(i.status) && i.dueDate < now;
            return (
              <TR key={i.id}>
                <TD><Link href={`/app/finance/invoices/${i.id}`} className="ltr-nums font-mono font-medium text-ink hover:underline">{i.number}</Link></TD>
                <TD className="max-w-[200px] truncate">{L(i.client.nameEn, i.client.nameAr)}</TD>
                <TD className="ltr-nums hidden font-mono text-[12px] text-ink-muted md:table-cell">{i.matter?.internalNumber ?? "—"}</TD>
                <TD className={`hidden sm:table-cell ${late ? "font-medium text-danger" : "text-ink-muted"}`}>{formatDate(i.dueDate, locale, tz)}</TD>
                <TD className="ltr-nums text-end tabular">{formatMoney(i.total, locale, cur)}</TD>
                <TD className={`ltr-nums text-end tabular ${due > 0 ? "font-medium" : "text-ink-subtle"}`}>{formatMoney(due, locale, cur)}</TD>
                <TD><Badge tone={late ? "danger" : INVOICE_STATUS_TONE[i.status]}>{late ? t("finance.overdue") : t(`enums.invoiceStatus.${i.status}`)}</Badge></TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("finance.title")} subtitle={t("finance.subtitle")} actions={<>
        {ctx.can("finance.manage") && <ExpenseButton />}
        {ctx.can("finance.manage") && <Button asChild variant="primary"><Link href="/app/finance/invoices/new"><Plus /> {t("finance.newInvoice")}</Link></Button>}
      </>} />
      <div className="mt-5 border-b border-line">
        <LinkTabs active={tab} tabs={TABS.filter((k) => k === "time" || ctx.can("finance.view")).map((k) => ({ key: k, href: `/app/finance?tab=${k}`, label: t(`finance.tabs.${k}`) }))} />
      </div>

      {tab === "overview" && snap && (
        <div className="mt-5 space-y-5">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs lg:grid-cols-4">
            {[[t("finance.outstanding"), snap.outstanding, `${snap.outstandingCount}`, ""], [t("finance.overdue"), snap.overdue, `${snap.overdueCount}`, snap.overdue > 0 ? "text-danger" : ""], [t("finance.receivedMonth"), snap.receivedThisMonth, "", "text-success"], [t("finance.unbilled"), snap.unbilledValue, formatMinutes(snap.unbilledMinutes, locale), ""]].map(([k, v, sub, c]) => (
              <div key={k as string} className="bg-surface px-4 py-3.5">
                <dt className="text-[11.5px] text-ink-subtle">{k}</dt>
                <dd className={`ltr-nums mt-1 text-xl font-semibold tabular ${c}`}>{formatMoney(v as number, locale, cur)}</dd>
                {sub && <dd className="text-[11.5px] text-ink-subtle">{sub}</dd>}
              </div>
            ))}
          </dl>
          <div className="grid gap-5 xl:grid-cols-12">
            <Panel className="xl:col-span-8" title={t("finance.tabs.invoices")} icon={<Receipt />} actions={<Link href="/app/finance?tab=invoices" className="text-xs text-ink-muted hover:text-ink">{t("common.viewAll")}</Link>}>{invoiceTable(data.invoices)}</Panel>
            <Panel className="xl:col-span-4" title={t("finance.recentPayments")} icon={<CreditCard />}>
              {data.payments.length === 0 ? <EmptyState compact title={t("finance.noPayments")} /> : (
                <ul className="divide-y divide-line">
                  {data.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                      <div className="min-w-0"><Link href={`/app/finance/invoices/${p.invoice.id}`} className="ltr-nums font-mono hover:underline">{p.invoice.number}</Link><p className="truncate text-[12px] text-ink-subtle">{L(p.invoice.client.nameEn, p.invoice.client.nameAr)} · {formatDate(p.receivedAt, locale, tz)}</p></div>
                      <span className={`ltr-nums tabular font-medium ${p.isRefund ? "text-danger" : "text-success"}`}>{formatMoney(p.amount, locale, cur)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === "invoices" && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap gap-1">
            {["", "DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"].map((s) => (
              <Link key={s} href={`/app/finance?tab=invoices${s ? `&status=${s}` : ""}`} className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium ${(sp.status ?? "") === s ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-surface"}`}>
                {s ? (s === "OVERDUE" ? t("finance.overdue") : t(`enums.invoiceStatus.${s}`)) : t("common.all")}
              </Link>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">{invoiceTable(data.invoices)}</div>
        </div>
      )}

      {tab === "payments" && (
        <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
          {data.payments.length === 0 ? <EmptyState icon={<CreditCard />} title={t("finance.noPayments")} /> : (
            <Table>
              <THead><tr><TH>{t("finance.receivedAt")}</TH><TH>{t("finance.number")}</TH><TH>{t("finance.client")}</TH><TH>{t("finance.method")}</TH><TH>{t("finance.reference")}</TH><TH className="text-end">{t("finance.amount")}</TH></tr></THead>
              <tbody>
                {data.payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{formatDate(p.receivedAt, locale, tz)}</TD>
                    <TD><Link href={`/app/finance/invoices/${p.invoice.id}`} className="ltr-nums font-mono hover:underline">{p.invoice.number}</Link></TD>
                    <TD>{L(p.invoice.client.nameEn, p.invoice.client.nameAr)}</TD>
                    <TD>{t(`finance.methods.${p.method}`)}</TD>
                    <TD className="ltr-nums text-ink-muted">{p.reference ?? "—"}</TD>
                    <TD className={`ltr-nums text-end tabular ${p.isRefund ? "text-danger" : ""}`}>{formatMoney(p.amount, locale, cur)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {tab === "expenses" && (
        <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
          {data.expenses.length === 0 ? <EmptyState icon={<Wallet />} title={t("finance.expense.empty")} /> : (
            <Table>
              <THead><tr><TH>{t("finance.expense.incurredAt")}</TH><TH>{t("finance.matter")}</TH><TH>{t("finance.expense.category")}</TH><TH>{t("common.description")}</TH><TH>{t("finance.expense.billable")}</TH><TH className="text-end">{t("finance.amount")}</TH></tr></THead>
              <tbody>
                {data.expenses.map((e) => (
                  <TR key={e.id}>
                    <TD>{formatDate(e.incurredAt, locale, tz)}</TD>
                    <TD className="ltr-nums font-mono text-[12px]">{e.matter ? <Link href={`/app/cases/${e.matter.id}/finance`} className="hover:underline">{e.matter.internalNumber}</Link> : "—"}</TD>
                    <TD>{t(`finance.expense.categories.${e.category}`)}</TD>
                    <TD className="max-w-[320px] truncate">{e.description}</TD>
                    <TD>{e.invoiceItem ? <Badge tone="success">{t("enums.invoiceStatus.ISSUED")}</Badge> : e.billable ? <Badge tone="info">{t("common.yes")}</Badge> : <Badge tone="outline">{t("common.no")}</Badge>}</TD>
                    <TD className="ltr-nums text-end tabular">{formatMoney(e.amount, locale, cur)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {tab === "time" && (
        <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
          {data.time.length === 0 ? <EmptyState icon={<Clock3 />} title={t("finance.time.empty")} /> : (
            <Table>
              <THead><tr><TH>{t("common.date")}</TH><TH>{t("finance.time.lawyer")}</TH><TH>{t("finance.matter")}</TH><TH>{t("finance.time.activity")}</TH><TH className="text-end">{t("finance.time.minutes")}</TH><TH className="text-end">{t("finance.time.value")}</TH></tr></THead>
              <tbody>
                {data.time.map((e) => (
                  <TR key={e.id}>
                    <TD>{formatDate(e.startedAt, locale, tz)}</TD>
                    <TD>{L(e.user.name, e.user.nameAr)}</TD>
                    <TD className="ltr-nums font-mono text-[12px]"><Link href={`/app/cases/${e.matter.id}/finance`} className="hover:underline">{e.matter.internalNumber}</Link></TD>
                    <TD>{t(`finance.time.activities.${e.activity}`)} {!e.endedAt && <Badge tone="info">{t("finance.time.running")}</Badge>}</TD>
                    <TD className="text-end tabular">{formatMinutes(e.minutes, locale)}</TD>
                    <TD className="ltr-nums text-end tabular">{e.billable && e.rate ? formatMoney((e.minutes / 60) * Number(e.rate), locale, cur) : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

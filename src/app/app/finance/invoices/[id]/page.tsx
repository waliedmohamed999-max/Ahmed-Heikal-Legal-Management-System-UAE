import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock, CreditCard } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getInvoice } from "@/server/services/finance-queries";
import { AppError } from "@/server/errors";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Badge, INVOICE_STATUS_TONE } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/time";
import { InvoiceActions } from "../../forms";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const inv = await getInvoice(ctx, id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const cur = inv.currency;
  const tz = ctx.org.timezone;
  const due = Number(inv.total) - Number(inv.amountPaid);
  const Back = locale === "ar" ? ChevronRight : ChevronLeft;
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/app/finance?tab=invoices" className="inline-flex items-center gap-1 text-[12.5px] text-ink-subtle hover:text-ink"><Back className="size-3.5" /> {t("finance.tabs.invoices")}</Link>
      <header className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="ltr-nums font-mono text-xl font-semibold text-ink">{inv.number}</h1><Badge tone={INVOICE_STATUS_TONE[inv.status]}>{t(`enums.invoiceStatus.${inv.status}`)}</Badge></div>
          <p className="mt-1 text-[13px] text-ink-muted">
            <Link href={`/app/clients/${inv.clientId}`} className="hover:underline">{L(inv.client.nameEn, inv.client.nameAr)}</Link>
            {inv.matter && <> · <Link href={`/app/cases/${inv.matter.id}/finance`} className="ltr-nums font-mono hover:underline">{inv.matter.internalNumber}</Link></>}
          </p>
        </div>
        <InvoiceActions id={inv.id} status={inv.status} due={due} paid={Number(inv.amountPaid)} canManage={ctx.can("finance.manage")} canApprove={ctx.can("finance.approve")} />
      </header>
      {inv.status !== "DRAFT" && <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-subtle"><Lock className="size-3.5" /> {t("finance.lockedNote")}</p>}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title={t("finance.items")}>
          <Table>
            <THead><tr><TH>{t("finance.item")}</TH><TH className="hidden sm:table-cell">{t("finance.kind")}</TH><TH className="text-end">{t("finance.qty")}</TH><TH className="text-end">{t("finance.unitPrice")}</TH><TH className="text-end">{t("finance.amount")}</TH></tr></THead>
            <tbody>
              {inv.items.map((i) => (
                <TR key={i.id}><TD>{i.description}</TD><TD className="hidden text-ink-muted sm:table-cell">{t(`finance.kinds.${i.kind}`)}</TD><TD className="text-end tabular">{Number(i.quantity)}</TD><TD className="ltr-nums text-end tabular">{formatMoney(i.unitPrice, locale, cur)}</TD><TD className="ltr-nums text-end tabular">{formatMoney(i.amount, locale, cur)}</TD></TR>
              ))}
            </tbody>
          </Table>
          <dl className="ms-auto w-full max-w-xs space-y-1 border-t border-line p-4 text-[13px]">
            {[[t("finance.subtotal"), inv.subtotal], [t("finance.discount"), inv.discount], [`${t("finance.vat")} (${Number(inv.vatRate)}%)`, inv.vatAmount]].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-ink-muted">{k as string}</dt><dd className="ltr-nums tabular">{formatMoney(v as never, locale, cur)}</dd></div>)}
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>{t("finance.total")}</dt><dd className="ltr-nums tabular">{formatMoney(inv.total, locale, cur)}</dd></div>
            <div className="flex justify-between text-success"><dt>{t("finance.paid")}</dt><dd className="ltr-nums tabular">{formatMoney(inv.amountPaid, locale, cur)}</dd></div>
            <div className="flex justify-between text-[14px] font-semibold"><dt>{t("finance.due")}</dt><dd className="ltr-nums tabular">{formatMoney(due, locale, cur)}</dd></div>
          </dl>
        </Panel>
        <div className="space-y-5">
          <Panel title={t("finance.invoice")}>
            <dl className="space-y-2 p-4 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-subtle">{t("finance.issueDate")}</dt><dd>{formatDate(inv.issueDate, locale, tz)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-subtle">{t("finance.dueDate")}</dt><dd>{formatDate(inv.dueDate, locale, tz)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-subtle">{t("finance.portalVisible")}</dt><dd>{inv.portalVisible ? t("common.yes") : t("common.no")}</dd></div>
              {inv.notes && <p className="whitespace-pre-line border-t border-line pt-2 text-ink-muted">{inv.notes}</p>}
            </dl>
          </Panel>
          <Panel title={t("finance.history")} icon={<CreditCard />}>
            {inv.payments.length === 0 ? <EmptyState compact title={t("finance.noPayments")} /> : (
              <ul className="divide-y divide-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <div><p>{t(`finance.methods.${p.method}`)}{p.reference && <span className="ltr-nums text-ink-subtle"> · {p.reference}</span>}</p><p className="text-[12px] text-ink-subtle">{formatDate(p.receivedAt, locale, tz)}</p></div>
                    <span className={`ltr-nums tabular font-medium ${p.isRefund ? "text-danger" : "text-success"}`}>{formatMoney(p.amount, locale, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

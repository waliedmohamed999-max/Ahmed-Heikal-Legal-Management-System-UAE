import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getInvoice } from "@/server/services/finance-queries";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { formatDate, formatMoney } from "@/lib/time";
import { Logo } from "@/components/brand";
import { PrintButton } from "./print-button";

export const metadata = { title: "Invoice" };

/** Bilingual print view — "Save as PDF" from the browser print dialog produces the PDF. */
export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const inv = await getInvoice(ctx, id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "invoice.printed", entityType: "Invoice", entityId: id, matterId: inv.matterId });
  const o = inv.organization;
  const cur = inv.currency;
  const tz = o.timezone;
  const due = Number(inv.total) - Number(inv.amountPaid);
  return (
    <div className="min-h-dvh bg-surface-muted py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[800px] justify-end px-4 print:hidden"><PrintButton label={t("finance.print")} /></div>
      <article className="mx-auto max-w-[800px] bg-white p-10 text-[13px] text-[#121826] shadow-md print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#0e1b33] pb-6">
          <div className="flex items-center gap-3 text-[#0e1b33]">
            <Logo size={44} />
            <div>
              <p className="text-[15px] font-semibold">{o.name}</p>
              {o.nameAr && <p dir="rtl" className="text-[14px]">{o.nameAr}</p>}
              {o.address && <p className="text-[11.5px] text-[#4a5163]">{o.address}</p>}
              {o.trn && <p className="ltr-nums text-[11.5px] text-[#4a5163]">{t("finance.trn")}: {o.trn}</p>}
            </div>
          </div>
          <div className="text-end">
            <p className="text-[20px] font-semibold tracking-tight">{t("finance.taxInvoice")}{locale === "en" ? " / فاتورة ضريبية" : " / Tax Invoice"}</p>
            <p className="ltr-nums mt-1 font-mono text-[14px]">{inv.number}</p>
            <p className="mt-2 text-[12px] text-[#4a5163]">{t("finance.issueDate")}: {formatDate(inv.issueDate, locale, tz)}</p>
            <p className="text-[12px] text-[#4a5163]">{t("finance.dueDate")}: {formatDate(inv.dueDate, locale, tz)}</p>
          </div>
        </header>
        <section className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7b8191]">{t("finance.billTo")}</p>
            <p className="mt-1 font-semibold">{inv.client.nameEn}</p>
            {inv.client.nameAr && <p dir="rtl">{inv.client.nameAr}</p>}
            {inv.client.address && <p className="text-[#4a5163]">{inv.client.address}</p>}
            {inv.client.email && <p className="ltr-nums text-[#4a5163]">{inv.client.email}</p>}
          </div>
          {inv.matter && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7b8191]">{t("finance.matter")}</p>
              <p className="ltr-nums mt-1 font-mono">{inv.matter.internalNumber}</p>
              <p>{locale === "ar" ? inv.matter.titleAr || inv.matter.title : inv.matter.title}</p>
            </div>
          )}
        </section>
        <table className="mt-8 w-full border-collapse">
          <thead><tr className="border-b border-[#d3d3cb] text-[11px] uppercase tracking-wide text-[#7b8191]"><th className="py-2 text-start font-semibold">{t("finance.item")}</th><th className="py-2 text-end font-semibold">{t("finance.qty")}</th><th className="py-2 text-end font-semibold">{t("finance.unitPrice")}</th><th className="py-2 text-end font-semibold">{t("finance.amount")}</th></tr></thead>
          <tbody>
            {inv.items.map((i) => (
              <tr key={i.id} className="border-b border-[#ebebe6]"><td className="py-2.5 pe-4">{i.description}</td><td className="py-2.5 text-end tabular">{Number(i.quantity)}</td><td className="ltr-nums py-2.5 text-end tabular">{formatMoney(i.unitPrice, locale, cur)}</td><td className="ltr-nums py-2.5 text-end tabular">{formatMoney(i.amount, locale, cur)}</td></tr>
            ))}
          </tbody>
        </table>
        <dl className="ms-auto mt-6 w-72 space-y-1.5">
          {[[t("finance.subtotal"), inv.subtotal], [t("finance.discount"), inv.discount], [`${t("finance.vat")} ${Number(inv.vatRate)}%`, inv.vatAmount]].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-[#4a5163]">{k as string}</dt><dd className="ltr-nums tabular">{formatMoney(v as never, locale, cur)}</dd></div>)}
          <div className="flex justify-between border-t-2 border-[#0e1b33] pt-2 text-[15px] font-semibold"><dt>{t("finance.total")}</dt><dd className="ltr-nums tabular">{formatMoney(inv.total, locale, cur)}</dd></div>
          <div className="flex justify-between"><dt className="text-[#4a5163]">{t("finance.paid")}</dt><dd className="ltr-nums tabular">{formatMoney(inv.amountPaid, locale, cur)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>{t("finance.due")}</dt><dd className="ltr-nums tabular">{formatMoney(due, locale, cur)}</dd></div>
        </dl>
        {inv.notes && <p className="mt-8 whitespace-pre-line border-t border-[#ebebe6] pt-4 text-[12px] text-[#4a5163]">{inv.notes}</p>}
        {o.isDemo && <p className="mt-8 text-center text-[11px] text-[#b42318]">{t("app.demoBanner")}</p>}
      </article>
    </div>
  );
}

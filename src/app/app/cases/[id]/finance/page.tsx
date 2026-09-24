import Link from "next/link";
import { notFound } from "next/navigation";
import { Receipt, Clock3, Wallet, Scale, Plus } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace } from "@/server/services/workspace";
import { db } from "@/server/db";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge, INVOICE_STATUS_TONE } from "@/components/ui/badge";
import { formatDate, formatMinutes, formatMoney } from "@/lib/time";
import { TimerWidget, ExpenseButton } from "@/app/app/finance/forms";

export default async function CaseFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const ws = await loadWorkspace(ctx, id);
  if (ws.state !== "ok") return null; // the layout renders the restricted / missing state
  if (!ws.caps.includes("finance.view")) notFound();
  const m = ws.matter;
  const [invoices, expenses, time, running] = await Promise.all([
    db.invoice.findMany({ where: { matterId: id, deletedAt: null }, orderBy: { issueDate: "desc" } }),
    db.expense.findMany({ where: { matterId: id, deletedAt: null }, orderBy: { incurredAt: "desc" } }),
    db.timeEntry.findMany({ where: { matterId: id, deletedAt: null }, orderBy: { startedAt: "desc" }, include: { user: { select: { name: true, nameAr: true } } } }),
    db.timeEntry.findFirst({ where: { userId: ctx.user.id, matterId: id, endedAt: null, deletedAt: null } }),
  ]);
  const cur = m.currency;
  const tz = ctx.org.timezone;
  const totalMin = time.reduce((s, x) => s + x.minutes, 0);
  const billed = invoices.filter((i) => i.status !== "VOID").reduce((s, i) => s + Number(i.total), 0);
  const paid = invoices.reduce((s, i) => s + Number(i.amountPaid), 0);
  const canManage = ws.caps.includes("finance.manage") || (ctx.can("finance.manage") && ctx.principal.scope !== "ASSIGNED");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title={t("workspace.feeArrangement")} icon={<Scale />}>
          <dl className="space-y-1.5 p-4 text-body">
            <div className="flex justify-between"><dt className="text-ink-subtle">{t("intake.fees")}</dt><dd>{t(`enums.billingType.${m.billingType}`)}</dd></div>
            {m.feeAmount != null && <div className="flex justify-between"><dt className="text-ink-subtle">{t("intake.feeAmount")}</dt><dd className="ltr-nums">{formatMoney(m.feeAmount, locale, cur)}</dd></div>}
            {m.hourlyRate != null && <div className="flex justify-between"><dt className="text-ink-subtle">{t("intake.hourlyRate")}</dt><dd className="ltr-nums">{formatMoney(m.hourlyRate, locale, cur)}</dd></div>}
            {m.feeNotes && <p className="pt-1 text-ink-muted">{m.feeNotes}</p>}
          </dl>
        </Panel>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs lg:col-span-2">
          {[[t("finance.total"), formatMoney(billed, locale, cur)], [t("finance.paid"), formatMoney(paid, locale, cur)], [t("finance.due"), formatMoney(billed - paid, locale, cur)], [t("finance.time.total"), formatMinutes(totalMin, locale)]].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3"><dt className="text-meta text-ink-subtle">{k}</dt><dd className="ltr-nums mt-0.5 text-lg font-semibold tabular">{v}</dd></div>
          ))}
        </dl>
      </div>

      {ws.caps.includes("time.track") && (
        <Panel title={t("workspace.timeLogged")} icon={<Clock3 />} actions={<TimerWidget matterId={id} running={running ? { id: running.id, startedAt: running.startedAt.toISOString(), activity: running.activity } : null} />}>
          {time.length === 0 ? <EmptyState compact title={t("finance.time.empty")} /> : (
            <ul className="divide-y divide-line">
              {time.slice(0, 20).map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-2 text-body">
                  <span className="w-24 text-ink-muted">{formatDate(x.startedAt, locale, tz, { day: "numeric", month: "short", year: undefined })}</span>
                  <span className="flex-1 truncate">{t(`finance.time.activities.${x.activity}`)} · {locale === "ar" ? x.user.nameAr || x.user.name : x.user.name}{x.notes && <span className="text-ink-subtle"> — {x.notes}</span>}</span>
                  {!x.endedAt && <Badge tone="info">{t("finance.time.running")}</Badge>}
                  <span className="tabular text-ink">{formatMinutes(x.minutes, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title={t("workspace.invoices")} icon={<Receipt />} actions={canManage && <Button asChild size="sm" variant="secondary"><Link href={`/app/finance/invoices/new?matter=${id}`}><Plus /> {t("finance.newInvoice")}</Link></Button>}>
          {invoices.length === 0 ? <EmptyState compact title={t("finance.emptyInvoices")} /> : (
            <ul className="divide-y divide-line">
              {invoices.map((i) => (
                <li key={i.id}><Link href={`/app/finance/invoices/${i.id}`} className="flex items-center gap-2 px-4 py-2.5 text-body hover:bg-surface-muted/60"><span className="ltr-nums flex-1 font-mono">{i.number}</span><span className="ltr-nums tabular">{formatMoney(i.total, locale, cur)}</span><Badge tone={INVOICE_STATUS_TONE[i.status]}>{t(`enums.invoiceStatus.${i.status}`)}</Badge></Link></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t("workspace.expenses")} icon={<Wallet />} actions={canManage && <ExpenseButton matterId={id} />}>
          {expenses.length === 0 ? <EmptyState compact title={t("finance.expense.empty")} /> : (
            <ul className="divide-y divide-line">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-4 py-2.5 text-body"><span className="flex-1 truncate">{t(`finance.expense.categories.${e.category}`)} · {e.description}</span><span className="text-meta text-ink-subtle">{formatDate(e.incurredAt, locale, tz)}</span><span className="ltr-nums tabular">{formatMoney(e.amount, locale, cur)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

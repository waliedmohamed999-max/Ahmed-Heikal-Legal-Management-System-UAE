"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray } from "react-hook-form";
import { Plus, Trash2, Download, Play, Square, Clock3, Send, Ban, Printer, CreditCard, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { useAction, useServerForm } from "@/components/forms";
import { expenseSchema, invoiceSchema, paymentSchema, timeEntrySchema, TIME_ACTIVITIES, EXPENSE_CATEGORIES } from "@/lib/finance-schemas";
import { formatMoney, isoDateInDays } from "@/lib/time";
import { useNow } from "@/components/countdown";
import { expenseAction, saveInvoiceAction, paymentAction, invoiceStatusAction, unbilledAction, logTimeAction, startTimerAction, stopTimerAction } from "./actions";
import type { z } from "zod";

const today = () => isoDateInDays(0);
const isoInDays = (n: number) => isoDateInDays(n);

// ─────────────────────────── Expense ───────────────────────────
export function ExpenseButton({ matterId, label }: { matterId?: string; label?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size={matterId ? "sm" : "md"} onClick={() => setOpen(true)}><Plus /> {label ?? t("finance.expense.new")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>{open && <ExpenseDialog matterId={matterId} onDone={() => setOpen(false)} />}</Dialog>
    </>
  );
}

function ExpenseDialog({ matterId, onDone }: { matterId?: string; onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const { form, submit, pending, err } = useServerForm({
    schema: expenseSchema,
    defaultValues: { matterId: matterId ?? "", category: "COURT_FEE", description: "", amount: "" as never, incurredAt: today(), billable: true, receiptDocumentId: "" },
    action: expenseAction, successMessage: t("common.changesSaved"), onSuccess: () => { router.refresh(); onDone(); },
  });
  const r = form.register;
  return (
    <DialogContent title={t("finance.expense.new")}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        {!matterId && <Field label={t("finance.matter")} className="sm:col-span-2">{(a) => <Picker {...a} type="matters" value={form.watch("matterId")} onChange={(i) => form.setValue("matterId", i?.id ?? "")} />}</Field>}
        <Field label={t("finance.expense.category")}>{(a) => <Select {...a} {...r("category")}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`finance.expense.categories.${c}`)}</option>)}</Select>}</Field>
        <Field label={t("finance.amount")} error={err("amount")} required>{(a) => <Input {...a} type="number" step="0.01" min="0" dir="ltr" {...r("amount")} />}</Field>
        <Field label={t("common.description")} error={err("description")} required className="sm:col-span-2">{(a) => <Input {...a} {...r("description")} />}</Field>
        <Field label={t("finance.expense.incurredAt")} error={err("incurredAt")}>{(a) => <Input {...a} type="date" {...r("incurredAt")} />}</Field>
        <Checkbox label={t("finance.expense.billable")} {...r("billable")} className="self-end pb-2" />
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─────────────────────────── Invoice editor ───────────────────────────
export function InvoiceEditor({ initial, labels, vatRate }: { initial?: z.input<typeof invoiceSchema>; labels?: { client?: string; matter?: string }; vatRate: number }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, pending: loadingUnbilled } = useAction();
  // Defaults are computed once (lazy state) — dates must not change between renders.
  const [defaults] = useState<z.input<typeof invoiceSchema>>(() => initial ?? { id: "", clientId: "", matterId: "", issueDate: today(), dueDate: isoInDays(30), discount: 0, vatRate, notes: "", portalVisible: true, items: [{ description: "", kind: "FEE", quantity: 1, unitPrice: 0, timeEntryId: null, expenseId: null }] });
  const { form, submit, pending, err } = useServerForm({
    schema: invoiceSchema,
    defaultValues: defaults,
    action: saveInvoiceAction, successMessage: t("common.changesSaved"), onSuccess: (d) => router.push(`/app/finance/invoices/${(d as { id: string }).id}`),
  });
  const items = useFieldArray({ control: form.control, name: "items" });
  const r = form.register;
  const w = form.watch();
  const subtotal = (w.items ?? []).reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);
  const disc = Math.min(Number(w.discount || 0), subtotal);
  const vat = ((subtotal - disc) * Number(w.vatRate || 0)) / 100;
  const total = subtotal - disc + vat;

  const addUnbilled = () => {
    if (!w.matterId) return;
    run(() => unbilledAction({ matterId: w.matterId as string }), {
      onSuccess: (d) => {
        const u = d as { time: { id: string; description: string; hours: number; rate: number }[]; expenses: { id: string; description: string; amount: number }[] };
        const existing = new Set((w.items ?? []).map((i) => i.timeEntryId || i.expenseId).filter(Boolean));
        for (const x of u.time) if (!existing.has(x.id)) items.append({ description: x.description, kind: "TIME", quantity: x.hours, unitPrice: x.rate, timeEntryId: x.id, expenseId: null });
        for (const x of u.expenses) if (!existing.has(x.id)) items.append({ description: x.description, kind: "EXPENSE", quantity: 1, unitPrice: x.amount, timeEntryId: null, expenseId: x.id });
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 shadow-xs sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("finance.client")} error={err("clientId")} required className="lg:col-span-2">
          {(a) => <Picker {...a} type="clients" value={w.clientId} initialLabel={labels?.client} invalid={!!err("clientId")} onChange={(i) => { form.setValue("clientId", i?.id ?? "", { shouldValidate: true }); form.setValue("matterId", ""); }} />}
        </Field>
        <Field label={t("finance.matter")} error={err("matterId")} className="lg:col-span-2">
          {(a) => <Picker {...a} type="matters" value={w.matterId} initialLabel={labels?.matter} onChange={(i) => { form.setValue("matterId", i?.id ?? ""); if (i?.clientId && !w.clientId) form.setValue("clientId", i.clientId); }} />}
        </Field>
        <Field label={t("finance.issueDate")} error={err("issueDate")}>{(a) => <Input {...a} type="date" {...r("issueDate")} />}</Field>
        <Field label={t("finance.dueDate")} error={err("dueDate")}>{(a) => <Input {...a} type="date" {...r("dueDate")} />}</Field>
        <Field label={t("finance.vatRate")} error={err("vatRate")}>{(a) => <Input {...a} type="number" step="0.01" dir="ltr" {...r("vatRate")} />}</Field>
        <Field label={t("finance.discount")} error={err("discount")}>{(a) => <Input {...a} type="number" step="0.01" min="0" dir="ltr" {...r("discount")} />}</Field>
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-body font-semibold">{t("finance.items")}</h2>
          <Button type="button" size="sm" variant="secondary" disabled={!w.matterId} loading={loadingUnbilled} onClick={addUnbilled}><Download /> {t("finance.addUnbilled")}</Button>
        </div>
        <div className="divide-y divide-line">
          {items.fields.map((f, i) => (
            <div key={f.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[1fr_130px_90px_130px_120px_auto] sm:items-center">
              <Input aria-label={t("finance.item")} placeholder={t("finance.item")} {...r(`items.${i}.description`)} aria-invalid={!!err(`items.${i}.description`) || undefined} />
              <Select aria-label={t("finance.kind")} {...r(`items.${i}.kind`)}>{["FEE", "TIME", "EXPENSE", "DISBURSEMENT", "COURT_FEE"].map((k) => <option key={k} value={k}>{t(`finance.kinds.${k}`)}</option>)}</Select>
              <Input aria-label={t("finance.qty")} type="number" step="0.01" min="0" dir="ltr" {...r(`items.${i}.quantity`)} />
              <Input aria-label={t("finance.unitPrice")} type="number" step="0.01" min="0" dir="ltr" {...r(`items.${i}.unitPrice`)} />
              <span className="ltr-nums text-end text-body tabular">{formatMoney(Number(w.items?.[i]?.quantity || 0) * Number(w.items?.[i]?.unitPrice || 0), locale)}</span>
              <Button type="button" variant="danger-ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => items.remove(i)} disabled={items.fields.length === 1}><Trash2 /></Button>
            </div>
          ))}
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-line px-4 py-3">
          <Button type="button" size="sm" variant="ghost" onClick={() => items.append({ description: "", kind: "FEE", quantity: 1, unitPrice: 0, timeEntryId: null, expenseId: null })}><Plus /> {t("finance.addItem")}</Button>
          <dl className="w-64 space-y-1 text-body">
            {[[t("finance.subtotal"), subtotal], [t("finance.discount"), -disc], [`${t("finance.vat")} (${w.vatRate}%)`, vat]].map(([k, v]) => <div key={k as string} className="flex justify-between"><dt className="text-ink-muted">{k}</dt><dd className="ltr-nums tabular">{formatMoney(v as number, locale)}</dd></div>)}
            <div className="flex justify-between border-t border-line pt-1 text-ui font-semibold"><dt>{t("finance.total")}</dt><dd className="ltr-nums tabular">{formatMoney(total, locale)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 shadow-xs">
        <Field label={t("finance.notes")}>{(a) => <Textarea {...a} rows={3} {...r("notes")} />}</Field>
        <Checkbox label={t("finance.portalVisible")} {...r("portalVisible")} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>{t("finance.saveDraft")}</Button>
      </div>
    </form>
  );
}

// ─────────────────────────── Invoice actions ───────────────────────────
export function InvoiceActions({ id, status, due, canManage, canApprove, paid }: { id: string; status: string; due: number; canManage: boolean; canApprove: boolean; paid: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [pay, setPay] = useState<"payment" | "refund" | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="secondary"><a href={`/print/invoices/${id}`} target="_blank" rel="noreferrer"><Printer /> {t("finance.print")}</a></Button>
      {canManage && status === "DRAFT" && <Button asChild variant="secondary"><a href={`/app/finance/invoices/${id}/edit`}>{t("common.edit")}</a></Button>}
      {canManage && status === "DRAFT" && <Button variant="primary" loading={pending} onClick={() => run(() => invoiceStatusAction({ id, to: "ISSUED" }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() })}><Send /> {t("finance.issue")}</Button>}
      {canManage && ["ISSUED", "PARTIALLY_PAID"].includes(status) && due > 0 && <Button variant="primary" onClick={() => setPay("payment")}><CreditCard /> {t("finance.recordPayment")}</Button>}
      {canApprove && paid > 0 && <Button variant="ghost" onClick={() => setPay("refund")}><Undo2 /> {t("finance.refund")}</Button>}
      {canApprove && status !== "VOID" && paid === 0 && status !== "DRAFT" && <Button variant="danger-ghost" loading={pending} onClick={() => run(() => invoiceStatusAction({ id, to: "VOID" }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() })}><Ban /> {t("finance.void")}</Button>}
      <Dialog open={!!pay} onOpenChange={(o) => !o && setPay(null)}>
        {pay && <PaymentDialog invoiceId={id} max={pay === "refund" ? paid : due} refund={pay === "refund"} onDone={() => { setPay(null); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

function PaymentDialog({ invoiceId, max, refund, onDone }: { invoiceId: string; max: number; refund: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: paymentSchema,
    defaultValues: { invoiceId, amount: max, method: "BANK_TRANSFER", receivedAt: today(), reference: "", notes: "", isRefund: refund },
    action: paymentAction, successMessage: t("common.changesSaved"), onSuccess: onDone,
  });
  const r = form.register;
  return (
    <DialogContent title={refund ? t("finance.refund") : t("finance.recordPayment")}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("finance.amount")} error={err("amount")} required>{(a) => <Input {...a} type="number" step="0.01" min="0" max={max} dir="ltr" {...r("amount")} />}</Field>
        <Field label={t("finance.method")}>{(a) => <Select {...a} {...r("method")}>{["BANK_TRANSFER", "CARD", "CASH", "CHEQUE", "OTHER"].map((m) => <option key={m} value={m}>{t(`finance.methods.${m}`)}</option>)}</Select>}</Field>
        <Field label={t("finance.receivedAt")} error={err("receivedAt")}>{(a) => <Input {...a} type="date" {...r("receivedAt")} />}</Field>
        <Field label={t("finance.reference")}>{(a) => <Input {...a} dir="ltr" {...r("reference")} />}</Field>
        <Field label={t("common.notes")} className="sm:col-span-2">{(a) => <Input {...a} {...r("notes")} />}</Field>
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─────────────────────────── Time tracking ───────────────────────────
export function TimerWidget({ matterId, running }: { matterId: string; running: { id: string; startedAt: string; activity: string } | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const now = useNow(true);
  const [activity, setActivity] = useState<(typeof TIME_ACTIVITIES)[number]>("DRAFTING");
  const [logOpen, setLogOpen] = useState(false);
  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000)) : 0;
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0"), mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0"), ss = String(elapsed % 60).padStart(2, "0");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {running ? (
        <>
          <span className="inline-flex items-center gap-2 rounded-md bg-info-soft px-2.5 py-1.5 text-body font-medium text-info"><Clock3 className="size-4 animate-pulse-soft" /> {t(`finance.time.activities.${running.activity}`)} <span className="ltr-nums font-mono tabular" suppressHydrationWarning>{hh}:{mm}:{ss}</span></span>
          <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => stopTimerAction({ id: running.id }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() })}><Square /> {t("finance.time.stop")}</Button>
        </>
      ) : (
        <>
          <Select value={activity} onChange={(e) => setActivity(e.target.value as never)} className="h-8 w-40 text-body" aria-label={t("finance.time.activity")}>{TIME_ACTIVITIES.map((a) => <option key={a} value={a}>{t(`finance.time.activities.${a}`)}</option>)}</Select>
          <Button size="sm" variant="primary" loading={pending} onClick={() => run(() => startTimerAction({ matterId, activity }), { onSuccess: () => router.refresh() })}><Play /> {t("finance.time.start")}</Button>
        </>
      )}
      <Button size="sm" variant="secondary" onClick={() => setLogOpen(true)}><Plus /> {t("finance.time.log")}</Button>
      <Dialog open={logOpen} onOpenChange={setLogOpen}>{logOpen && <LogTimeDialog matterId={matterId} onDone={() => { setLogOpen(false); router.refresh(); }} />}</Dialog>
    </div>
  );
}

function LogTimeDialog({ matterId, onDone }: { matterId: string; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: timeEntrySchema,
    defaultValues: { matterId, activity: "DRAFTING", minutes: 60, date: today(), billable: true, notes: "" },
    action: logTimeAction, successMessage: t("common.changesSaved"), onSuccess: onDone,
  });
  const r = form.register;
  return (
    <DialogContent title={t("finance.time.log")}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("finance.time.activity")}>{(a) => <Select {...a} {...r("activity")}>{TIME_ACTIVITIES.map((x) => <option key={x} value={x}>{t(`finance.time.activities.${x}`)}</option>)}</Select>}</Field>
        <Field label={t("finance.time.minutes")} error={err("minutes")}>{(a) => <Input {...a} type="number" min={1} step={5} dir="ltr" {...r("minutes")} />}</Field>
        <Field label={t("common.date")} error={err("date")}>{(a) => <Input {...a} type="date" {...r("date")} />}</Field>
        <Checkbox label={t("finance.time.billable")} {...r("billable")} className="self-end pb-2" />
        <Field label={t("common.notes")} className="sm:col-span-2">{(a) => <Input {...a} {...r("notes")} />}</Field>
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

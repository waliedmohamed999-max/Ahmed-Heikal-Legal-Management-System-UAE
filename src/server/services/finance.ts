import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import type { StaffContext } from "../auth/session";
import { AppError, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { assertMatter, assertPermission, matterAccess } from "./access";
import { logActivity } from "./activity";
import { notify } from "./notifications";
import { nextCounter } from "./matters";
import { fromZonedLocal, zonedParts } from "@/lib/time";
import { expenseSchema, invoiceItemSchema, invoiceSchema, paymentSchema, TIME_ACTIVITIES, timeEntrySchema } from "@/lib/finance-schemas";

export { expenseSchema, invoiceItemSchema, invoiceSchema, paymentSchema, TIME_ACTIVITIES, timeEntrySchema };

const D = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);
const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function computeTotals(items: { quantity: number; unitPrice: number }[], discount: number, vatRate: number) {
  const subtotal = round2(items.reduce((s, i) => s.plus(D(i.quantity).times(D(i.unitPrice))), D(0)));
  const disc = Prisma.Decimal.min(D(discount), subtotal);
  const taxable = subtotal.minus(disc);
  const vat = round2(taxable.times(D(vatRate)).dividedBy(100));
  return { subtotal, discount: round2(disc), vatAmount: vat, total: round2(taxable.plus(vat)) };
}

function statusFor(total: Prisma.Decimal, paid: Prisma.Decimal, current: string) {
  if (current === "VOID" || current === "DRAFT") return current;
  if (paid.gte(total) && total.gt(0)) return "PAID";
  if (paid.gt(0)) return "PARTIALLY_PAID";
  return "ISSUED";
}

/** Finance roles see every invoice; others only invoices of matters they can access with finance.view. */
async function assertInvoiceAccess(ctx: StaffContext, inv: { matterId: string | null }, action: "finance.view" | "finance.manage") {
  if (ctx.can(action) && ctx.principal.scope !== "ASSIGNED") return;
  if (inv.matterId) {
    const acc = await matterAccess(ctx, inv.matterId);
    if (acc.has(action as never)) return;
  }
  if (ctx.can(action) && !inv.matterId) return;
  throw notFound();
}

async function nextInvoiceNumber(tx: Tx, ctx: StaffContext) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.org.id }, select: { invoicePrefix: true } });
  const year = zonedParts(new Date(), ctx.org.timezone).year;
  const n = await nextCounter(tx, ctx.org.id, `invoice:${year}`);
  return `${org.invoicePrefix}-${year}-${String(n).padStart(4, "0")}`;
}

export async function saveInvoice(ctx: StaffContext, input: z.output<typeof invoiceSchema>) {
  assertPermission(ctx, "finance.manage");
  // Finance-scope roles invoice any matter; case-scoped users need finance.manage on that case.
  if (input.matterId && ctx.principal.scope === "ASSIGNED") await assertMatter(ctx, input.matterId, "finance.manage");
  const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.org.id, deletedAt: null } });
  if (!client) throw notFound();
  if (input.matterId) {
    const m = await db.matter.findFirst({ where: { id: input.matterId, organizationId: ctx.org.id, clientId: input.clientId } });
    if (!m) throw new AppError("validation", 400, { matterId: "invalid" });
  }
  const tz = ctx.org.timezone;
  const t = computeTotals(input.items, input.discount, input.vatRate);
  const issueDate = fromZonedLocal(input.issueDate, tz);
  const dueDate = fromZonedLocal(input.dueDate, tz);
  if (dueDate < issueDate) throw new AppError("validation", 400, { dueDate: "endBeforeStart" });

  return db.$transaction(async (tx) => {
    // Linked time entries / expenses can only be billed once.
    const timeIds = input.items.map((i) => i.timeEntryId).filter(Boolean) as string[];
    const expIds = input.items.map((i) => i.expenseId).filter(Boolean) as string[];
    let invoiceId = input.id || null;
    if (invoiceId) {
      const before = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.org.id, deletedAt: null } });
      if (!before) throw notFound();
      if (before.status !== "DRAFT") throw new AppError("invoiceLocked", 400);
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    }
    const taken = await tx.invoiceItem.count({ where: { OR: [{ timeEntryId: { in: timeIds } }, { expenseId: { in: expIds } }] } });
    if (taken) throw new AppError("alreadyInvoiced", 409);
    const data = {
      clientId: input.clientId, matterId: input.matterId || null, issueDate, dueDate, vatRate: D(input.vatRate), notes: input.notes || null, portalVisible: input.portalVisible,
      subtotal: t.subtotal, discount: t.discount, vatAmount: t.vatAmount, total: t.total, updatedById: ctx.user.id,
    };
    const inv = invoiceId
      ? await tx.invoice.update({ where: { id: invoiceId }, data })
      : await tx.invoice.create({ data: { ...data, organizationId: ctx.org.id, number: await nextInvoiceNumber(tx, ctx), status: "DRAFT", createdById: ctx.user.id } });
    await tx.invoiceItem.createMany({
      data: input.items.map((i, order) => ({
        invoiceId: inv.id, description: i.description, kind: i.kind, quantity: D(i.quantity), unitPrice: D(i.unitPrice), amount: round2(D(i.quantity).times(D(i.unitPrice))),
        timeEntryId: i.timeEntryId || null, expenseId: i.expenseId || null, order,
      })),
    });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: invoiceId ? "invoice.changed" : "invoice.created", entityType: "Invoice", entityId: inv.id, matterId: inv.matterId, after: { number: inv.number, total: t.total.toString(), items: input.items.length } }, tx);
    return { id: inv.id };
  });
}

export async function setInvoiceStatus(ctx: StaffContext, id: string, to: "ISSUED" | "VOID") {
  const inv = await db.invoice.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!inv) throw notFound();
  await assertInvoiceAccess(ctx, inv, "finance.manage");
  if (to === "ISSUED" && inv.status !== "DRAFT") throw new AppError("invalidTransition", 400);
  if (to === "VOID") {
    if (!ctx.can("finance.approve")) throw forbidden();
    if (inv.status === "VOID") throw new AppError("invalidTransition", 400);
    if (D(inv.amountPaid).gt(0)) throw new AppError("invalidTransition", 400);
  }
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: to, updatedById: ctx.user.id } });
    if (to === "VOID") await tx.invoiceItem.updateMany({ where: { invoiceId: id }, data: { timeEntryId: null, expenseId: null } }); // release items for re-billing
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: to === "ISSUED" ? "invoice.issued" : "invoice.voided", entityType: "Invoice", entityId: id, matterId: inv.matterId, before: { status: inv.status }, after: { status: to } }, tx);
    if (inv.matterId && to === "ISSUED") await logActivity({ organizationId: ctx.org.id, matterId: inv.matterId, actorId: ctx.user.id, type: "invoice.issued", entityType: "Invoice", entityId: id, data: { number: inv.number } }, tx);
  });
}

export async function recordPayment(ctx: StaffContext, input: z.output<typeof paymentSchema>) {
  const inv = await db.invoice.findFirst({ where: { id: input.invoiceId, organizationId: ctx.org.id, deletedAt: null } });
  if (!inv) throw notFound();
  await assertInvoiceAccess(ctx, inv, "finance.manage");
  if (["DRAFT", "VOID"].includes(inv.status)) throw new AppError("invalidTransition", 400);
  if (input.isRefund && !ctx.can("finance.approve")) throw forbidden();
  const amount = round2(D(input.amount));
  const due = D(inv.total).minus(D(inv.amountPaid));
  if (!input.isRefund && amount.gt(due)) throw new AppError("overpayment", 400, { amount: "invalid" });
  if (input.isRefund && amount.gt(D(inv.amountPaid))) throw new AppError("overpayment", 400, { amount: "invalid" });
  return db.$transaction(async (tx) => {
    const signed = input.isRefund ? amount.negated() : amount;
    const p = await tx.payment.create({
      data: { organizationId: ctx.org.id, invoiceId: inv.id, amount: signed, method: input.method, receivedAt: fromZonedLocal(input.receivedAt, ctx.org.timezone), reference: input.reference || null, notes: input.notes || null, isRefund: input.isRefund, recordedById: ctx.user.id },
    });
    const paid = round2(D(inv.amountPaid).plus(signed));
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status: statusFor(D(inv.total), paid, inv.status) as never } });
    await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: input.isRefund ? "payment.refunded" : "payment.received", entityType: "Payment", entityId: p.id, matterId: inv.matterId, after: { invoice: inv.number, amount: signed.toString(), method: input.method } }, tx);
    if (inv.matterId) {
      await logActivity({ organizationId: ctx.org.id, matterId: inv.matterId, actorId: ctx.user.id, type: "payment.received", entityType: "Payment", entityId: p.id, data: { amount: signed.toString() } }, tx);
      const m = await tx.matter.findUnique({ where: { id: inv.matterId }, select: { leadLawyerId: true } });
      await notify({ organizationId: ctx.org.id, userIds: [m?.leadLawyerId], excludeUserId: ctx.user.id, category: "FINANCE", titleKey: "notif.paymentReceived", params: { number: inv.number }, link: `/app/finance/invoices/${inv.id}` }, tx);
    }
    return { id: p.id };
  });
}

// ─────────────────────────── Expenses ───────────────────────────
export async function saveExpense(ctx: StaffContext, input: z.output<typeof expenseSchema>) {
  if (input.matterId) {
    const acc = await matterAccess(ctx, input.matterId);
    if (!acc.has("finance.manage") && !(ctx.can("finance.manage") && ctx.principal.scope !== "ASSIGNED")) throw forbidden();
  } else assertPermission(ctx, "finance.manage");
  if (input.receiptDocumentId && !(await db.document.findFirst({ where: { id: input.receiptDocumentId, organizationId: ctx.org.id } }))) throw notFound();
  const e = await db.expense.create({
    data: {
      organizationId: ctx.org.id, matterId: input.matterId || null, category: input.category, description: input.description, amount: round2(D(input.amount)),
      incurredAt: fromZonedLocal(input.incurredAt, ctx.org.timezone), billable: input.billable, receiptDocumentId: input.receiptDocumentId || null, createdById: ctx.user.id,
    },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "expense.created", entityType: "Expense", entityId: e.id, matterId: e.matterId, after: { amount: e.amount.toString(), category: e.category } });
  return { id: e.id };
}

// ─────────────────────────── Time tracking ───────────────────────────
async function rateFor(matterId: string) {
  const m = await db.matter.findUnique({ where: { id: matterId }, select: { hourlyRate: true } });
  return m?.hourlyRate ?? null;
}

export async function startTimer(ctx: StaffContext, matterId: string, activity: (typeof TIME_ACTIVITIES)[number], notes?: string | null) {
  await assertMatter(ctx, matterId, "time.track");
  const running = await db.timeEntry.findFirst({ where: { userId: ctx.user.id, endedAt: null, deletedAt: null } });
  if (running) await stopTimer(ctx, running.id);
  const e = await db.timeEntry.create({ data: { organizationId: ctx.org.id, matterId, userId: ctx.user.id, activity, startedAt: new Date(), billable: true, rate: await rateFor(matterId), notes: notes || null } });
  return { id: e.id };
}

export async function stopTimer(ctx: StaffContext, id: string) {
  const e = await db.timeEntry.findFirst({ where: { id, userId: ctx.user.id, endedAt: null } });
  if (!e) throw notFound();
  const end = new Date();
  const minutes = Math.max(1, Math.round((end.getTime() - e.startedAt.getTime()) / 60_000));
  await db.timeEntry.update({ where: { id }, data: { endedAt: end, minutes } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "time.logged", entityType: "TimeEntry", entityId: id, matterId: e.matterId, after: { minutes } });
  return { minutes };
}

export async function logTime(ctx: StaffContext, input: z.output<typeof timeEntrySchema>) {
  await assertMatter(ctx, input.matterId, "time.track");
  const start = fromZonedLocal(`${input.date}T09:00`, ctx.org.timezone);
  const e = await db.timeEntry.create({
    data: { organizationId: ctx.org.id, matterId: input.matterId, userId: ctx.user.id, activity: input.activity, startedAt: start, endedAt: new Date(start.getTime() + input.minutes * 60_000), minutes: input.minutes, billable: input.billable, rate: await rateFor(input.matterId), notes: input.notes || null },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "time.logged", entityType: "TimeEntry", entityId: e.id, matterId: e.matterId, after: { minutes: input.minutes, activity: input.activity } });
  return { id: e.id };
}

/** Unbilled billable time and expenses for a matter — used to build an invoice. */
export async function unbilledForMatter(ctx: StaffContext, matterId: string) {
  assertPermission(ctx, "finance.manage");
  const [time, expenses] = await Promise.all([
    db.timeEntry.findMany({ where: { matterId, billable: true, deletedAt: null, endedAt: { not: null }, invoiceItem: null }, include: { user: { select: { name: true } } }, orderBy: { startedAt: "asc" } }),
    db.expense.findMany({ where: { matterId, billable: true, deletedAt: null, invoiceItem: null }, orderBy: { incurredAt: "asc" } }),
  ]);
  return {
    time: time.map((x) => ({ id: x.id, description: `${x.activity} — ${x.user.name}${x.notes ? `: ${x.notes}` : ""}`, hours: Math.round((x.minutes / 60) * 100) / 100, rate: Number(x.rate ?? 0), date: x.startedAt.toISOString() })),
    expenses: expenses.map((x) => ({ id: x.id, description: `${x.category}: ${x.description}`, amount: Number(x.amount), date: x.incurredAt.toISOString() })),
  };
}

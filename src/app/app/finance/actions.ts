"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import {
  expenseSchema, invoiceSchema, logTime, paymentSchema, recordPayment, saveExpense, saveInvoice, setInvoiceStatus, startTimer, stopTimer, timeEntrySchema, unbilledForMatter, TIME_ACTIVITIES,
} from "@/server/services/finance";

const refresh = () => revalidatePath("/app", "layout");

export const saveInvoiceAction = staffAction(invoiceSchema, async (i, ctx) => { const r = await saveInvoice(ctx, i); refresh(); return r; });
export const invoiceStatusAction = staffAction(z.object({ id: z.string().uuid(), to: z.enum(["ISSUED", "VOID"]) }), async ({ id, to }, ctx) => { await setInvoiceStatus(ctx, id, to); refresh(); return { ok: true }; });
export const paymentAction = staffAction(paymentSchema, async (i, ctx) => { const r = await recordPayment(ctx, i); refresh(); return r; });
export const expenseAction = staffAction(expenseSchema, async (i, ctx) => { const r = await saveExpense(ctx, i); refresh(); return r; });
export const logTimeAction = staffAction(timeEntrySchema, async (i, ctx) => { const r = await logTime(ctx, i); refresh(); return r; });
export const startTimerAction = staffAction(z.object({ matterId: z.string().uuid(), activity: z.enum(TIME_ACTIVITIES), notes: z.string().max(500).optional() }), async ({ matterId, activity, notes }, ctx) => { const r = await startTimer(ctx, matterId, activity, notes); refresh(); return r; });
export const stopTimerAction = staffAction(z.object({ id: z.string().uuid() }), async ({ id }, ctx) => { const r = await stopTimer(ctx, id); refresh(); return r; });
export const unbilledAction = staffAction(z.object({ matterId: z.string().uuid() }), async ({ matterId }, ctx) => unbilledForMatter(ctx, matterId));

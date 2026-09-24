/** Finance schemas shared by forms (client) and the finance service (server). */
import { z } from "zod";

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "required").max(500),
  kind: z.enum(["FEE", "TIME", "EXPENSE", "DISBURSEMENT", "COURT_FEE"]).default("FEE"),
  quantity: z.coerce.number().positive("positive").max(100_000),
  unitPrice: z.coerce.number().min(0).max(1e10),
  timeEntryId: z.string().uuid().optional().nullable(),
  expenseId: z.string().uuid().optional().nullable(),
});

export const invoiceSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  clientId: z.string().uuid("required"),
  matterId: z.string().uuid().optional().or(z.literal("")),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
  discount: z.coerce.number().min(0).default(0),
  vatRate: z.coerce.number().min(0).max(100),
  notes: z.string().max(4000).optional().or(z.literal("")),
  portalVisible: z.boolean().default(false),
  items: z.array(invoiceItemSchema).min(1, "required").max(200),
});

export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive("positive"),
  method: z.enum(["BANK_TRANSFER", "CARD", "CASH", "CHEQUE", "OTHER"]),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
  reference: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  isRefund: z.boolean().default(false),
  // Generated once per opened payment form; makes double submission harmless.
  idempotencyKey: z.string().uuid().optional(),
});

export const expenseSchema = z.object({
  matterId: z.string().uuid().optional().or(z.literal("")),
  category: z.enum(["COURT_FEE", "TRANSLATION", "EXPERT_FEE", "COURIER", "TRAVEL", "GOVERNMENT_FEE", "OTHER"]),
  description: z.string().trim().min(1, "required").max(500),
  amount: z.coerce.number().positive("positive"),
  incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
  billable: z.boolean().default(true),
  receiptDocumentId: z.string().uuid().optional().or(z.literal("")),
});

export const TIME_ACTIVITIES = ["RESEARCH", "DRAFTING", "MEETING", "COURT", "CALL", "REVIEW", "TRAVEL", "OTHER"] as const;
export const timeEntrySchema = z.object({
  matterId: z.string().uuid("required"),
  activity: z.enum(TIME_ACTIVITIES),
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
  billable: z.boolean().default(true),
  notes: z.string().max(2000).optional().or(z.literal("")),
});


export const EXPENSE_CATEGORIES = ["COURT_FEE", "TRANSLATION", "EXPERT_FEE", "COURIER", "TRAVEL", "GOVERNMENT_FEE", "OTHER"] as const;

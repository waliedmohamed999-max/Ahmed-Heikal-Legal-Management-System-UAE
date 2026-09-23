/**
 * Shared validation schemas — used by client forms (react-hook-form + zodResolver)
 * and re-validated on the server in every action. Messages are i18n keys under `validation.*`.
 */
import { z } from "zod";

const text = (max = 300) => z.string().trim().max(max, "tooLong");
const req = (max = 300) => z.string().trim().min(1, "required").max(max, "tooLong");
const optText = (max = 2000) => text(max).optional().or(z.literal("")).transform((v) => (v ? v : null));
const optUuid = z.string().uuid().optional().or(z.literal("")).transform((v) => (v ? v : null));
/** "YYYY-MM-DDTHH:mm" wall-clock in office timezone */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "date");
const optLocalDateTime = localDateTime.optional().or(z.literal("")).transform((v) => (v ? v : null));
const money = z.union([z.number(), z.string()]).optional().transform((v, c) => {
  if (v === undefined || v === "" || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    c.addIssue({ code: "custom", message: "number" });
    return z.NEVER;
  }
  return Math.round(n * 100) / 100;
});

export const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
export const MATTER_KINDS = ["COURT_CASE", "CONSULTATION", "CONTRACT", "DISPUTE", "EXECUTION", "APPEAL", "ARBITRATION", "OTHER"] as const;
export const MATTER_STATUSES = ["INTAKE", "ACTIVE", "PENDING", "ON_HOLD", "CLOSED", "ARCHIVED"] as const;
export const CONFIDENTIALITY = ["STANDARD", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"] as const;
export const BILLING = ["NONE", "FIXED", "HOURLY", "RETAINER", "INSTALLMENTS"] as const;
export const MEMBER_ROLES = ["LEAD", "ASSIGNED", "ASSISTANT", "OBSERVER", "DOCUMENTS_ONLY"] as const;
export const PARTY_ROLES = ["OPPONENT", "OPPONENT_COUNSEL", "CO_CLAIMANT", "CO_DEFENDANT", "WITNESS", "EXPERT", "THIRD_PARTY", "RELATED"] as const;
export const RISK_FLAGS = ["DEADLINE_APPROACHING", "MISSING_DOCUMENTS", "WAITING_CLIENT", "PAYMENT_OUTSTANDING", "COURT_ACTION_REQUIRED", "NO_RECENT_ACTIVITY"] as const;
export const CONTACT_CATEGORIES = ["CLIENT", "OPPONENT", "LAWYER", "EXPERT", "TRANSLATOR", "WITNESS", "COMPANY", "GOVERNMENT", "OTHER"] as const;

// ─────────────────────────── Clients ───────────────────────────
export const clientSchema = z.object({
  type: z.enum(["INDIVIDUAL", "COMPANY"]),
  nameEn: req(200),
  nameAr: optText(200),
  email: z.string().trim().email("email").max(200).optional().or(z.literal("")).transform((v) => v || null),
  phone: optText(40),
  whatsapp: optText(40),
  address: optText(500),
  nationality: optText(80),
  preferredLanguage: z.enum(["ar", "en"]).default("ar"),
  tradeLicenseNo: optText(80),
  companyName: optText(200),
  emiratesId: optText(40),
  passportNo: optText(40),
  source: optText(60),
  notes: optText(4000),
  status: z.enum(["ACTIVE", "INACTIVE", "PROSPECT"]).default("ACTIVE"),
});
export type ClientInput = z.input<typeof clientSchema>;

export const contactSchema = z.object({
  type: z.enum(["INDIVIDUAL", "COMPANY"]).default("INDIVIDUAL"),
  category: z.enum(CONTACT_CATEGORIES),
  nameEn: req(200),
  nameAr: optText(200),
  companyName: optText(200),
  jobTitle: optText(120),
  email: z.string().trim().email("email").optional().or(z.literal("")).transform((v) => v || null),
  phone: optText(40),
  whatsapp: optText(40),
  address: optText(500),
  notes: optText(4000),
  clientId: optUuid,
});

// ─────────────────────────── Matters ───────────────────────────
export const partyInput = z.object({
  contactId: optUuid,
  nameEn: optText(200),
  nameAr: optText(200),
  type: z.enum(["INDIVIDUAL", "COMPANY"]).default("COMPANY"),
  role: z.enum(PARTY_ROLES),
});

export const intakeSchema = z.object({
  // Step 1 — client (existing or new)
  clientId: optUuid,
  newClient: clientSchema.partial({ type: true }).extend({ nameEn: z.string().trim().max(200) }).optional(),
  // Step 2 — opponents & parties
  parties: z.array(partyInput).max(30).default([]),
  // Step 3 — matter type
  kind: z.enum(MATTER_KINDS),
  caseTypeId: optUuid,
  // Step 4 — jurisdiction
  jurisdictionId: optUuid,
  courtId: optUuid,
  // Step 5 — details
  title: req(250),
  titleAr: optText(250),
  officialCaseNumber: optText(80),
  summary: optText(8000),
  claims: optText(8000),
  claimAmount: money,
  priority: z.enum(PRIORITIES).default("NORMAL"),
  confidentiality: z.enum(CONFIDENTIALITY).default("STANDARD"),
  // Step 7 — conflict check result (decision by an authorised user)
  conflictStatus: z.enum(["CLEAR", "POTENTIAL_MATCH_REVIEWED", "WAIVED"]),
  conflictNotes: optText(4000),
  // Step 8 — team
  leadLawyerId: optUuid,
  members: z.array(z.object({ userId: z.string().uuid(), role: z.enum(MEMBER_ROLES) })).max(40).default([]),
  // Step 9 — fees
  billingType: z.enum(BILLING).default("NONE"),
  feeAmount: money,
  hourlyRate: money,
  feeNotes: optText(2000),
  applyChecklist: z.boolean().default(true),
});
export type IntakeInput = z.input<typeof intakeSchema>;

export const matterUpdateSchema = z.object({
  id: z.string().uuid(),
  title: req(250),
  titleAr: optText(250),
  officialCaseNumber: optText(80),
  kind: z.enum(MATTER_KINDS),
  status: z.enum(MATTER_STATUSES),
  priority: z.enum(PRIORITIES),
  confidentiality: z.enum(CONFIDENTIALITY),
  caseTypeId: optUuid,
  jurisdictionId: optUuid,
  courtId: optUuid,
  stageId: optUuid,
  leadLawyerId: optUuid,
  summary: optText(8000),
  claims: optText(8000),
  claimAmount: money,
  currentStatusText: optText(2000),
  lastActionText: optText(2000),
  nextActionText: optText(2000),
  internalNotes: optText(8000),
  riskFlags: z.array(z.enum(RISK_FLAGS)).default([]),
  billingType: z.enum(BILLING),
  feeAmount: money,
  hourlyRate: money,
  feeNotes: optText(2000),
  portalEnabled: z.boolean(),
  portalStatusText: optText(2000),
});

export const conflictQuerySchema = z.object({ names: z.array(z.string().trim().min(2).max(200)).min(1).max(20) });

// ─────────────────────────── Events ───────────────────────────
export const hearingSchema = z.object({
  id: optUuid,
  matterId: z.string().uuid("required"),
  courtId: optUuid,
  courtRoom: optText(80),
  isRemote: z.boolean().default(false),
  remoteUrl: z.string().trim().url("url").optional().or(z.literal("")).transform((v) => v || null),
  startsAt: localDateTime,
  endsAt: optLocalDateTime,
  judge: optText(120),
  sessionType: optText(120),
  attendingLawyerId: optUuid,
  clientAttendance: z.enum(["REQUIRED", "OPTIONAL", "NOT_REQUIRED"]).default("NOT_REQUIRED"),
  requiredDocuments: optText(4000),
  preparationNotes: optText(8000),
  status: z.enum(["SCHEDULED", "PREPARING", "READY", "HELD", "ADJOURNED", "CANCELLED"]).optional(),
});

export const hearingReportSchema = z.object({
  hearingId: z.string().uuid(),
  outcome: req(8000),
  decisions: optText(8000),
  requiredActions: optText(8000),
  adjourned: z.boolean().default(true),
  nextHearingAt: optLocalDateTime,
  nextSessionType: optText(120),
  deadlineAt: optLocalDateTime,
  deadlineTitle: optText(250),
  deadlineType: z.enum(["SUBMISSION", "APPEAL", "PAYMENT", "DOCUMENT", "EXPERT_MEETING", "COURT_APPOINTMENT", "RENEWAL", "FOLLOW_UP", "INTERNAL", "OTHER"]).default("SUBMISSION"),
  responsibleId: optUuid,
  tasks: z.array(z.object({ title: req(250), assigneeId: optUuid, dueAt: optLocalDateTime })).max(20).default([]),
});

export const DEADLINE_TYPES = ["SUBMISSION", "APPEAL", "PAYMENT", "DOCUMENT", "EXPERT_MEETING", "COURT_APPOINTMENT", "RENEWAL", "FOLLOW_UP", "INTERNAL", "OTHER"] as const;
export const deadlineSchema = z.object({
  id: optUuid,
  matterId: optUuid,
  type: z.enum(DEADLINE_TYPES),
  title: req(250),
  description: optText(4000),
  dueAt: localDateTime,
  isCritical: z.boolean().default(false),
  assigneeId: optUuid,
});

export const APPOINTMENT_TYPES = ["CONSULTATION", "FOLLOW_UP", "DOCUMENT_SIGNING", "CASE_MEETING", "ONLINE_MEETING", "INTERNAL_MEETING", "CALL"] as const;
export const appointmentSchema = z
  .object({
    id: optUuid,
    type: z.enum(APPOINTMENT_TYPES),
    title: req(250),
    startsAt: localDateTime,
    durationMinutes: z.coerce.number().int().min(5).max(24 * 60).default(60),
    lawyerId: optUuid,
    clientId: optUuid,
    matterId: optUuid,
    leadId: optUuid,
    location: optText(250),
    meetingUrl: z.string().trim().url("url").optional().or(z.literal("")).transform((v) => v || null),
    notes: optText(4000),
    portalVisible: z.boolean().default(false),
  });

export const taskSchema = z.object({
  id: optUuid,
  matterId: optUuid,
  title: req(250),
  description: optText(8000),
  assigneeId: optUuid,
  priority: z.enum(PRIORITIES).default("NORMAL"),
  status: z.enum(["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"]).default("TODO"),
  startAt: optLocalDateTime,
  dueAt: optLocalDateTime,
  estimateMinutes: z.coerce.number().int().min(0).max(100_000).optional().or(z.literal("")).transform((v) => (v === "" || v == null ? null : Number(v))),
  checklist: z.array(z.string().trim().min(1).max(250)).max(50).optional(),
  dependsOn: z.array(z.string().uuid()).max(20).optional(),
});

export const noteSchema = z.object({
  matterId: z.string().uuid("required"),
  body: req(20000),
  visibility: z.enum(["PRIVATE", "TEAM", "CLIENT"]).default("TEAM"),
  /** Client-visible notes require an explicit confirmation from the author. */
  confirmClientVisible: z.boolean().optional(),
  pinned: z.boolean().default(false),
});

export const commentSchema = z.object({
  body: req(8000),
  matterId: optUuid,
  documentId: optUuid,
  taskId: optUuid,
});

export const communicationSchema = z.object({
  matterId: optUuid,
  clientId: optUuid,
  channel: z.enum(["EMAIL", "CALL", "MEETING", "WHATSAPP", "LETTER", "NOTE"]),
  direction: z.enum(["INBOUND", "OUTBOUND", "INTERNAL"]).default("OUTBOUND"),
  subject: optText(300),
  body: optText(20000),
  occurredAt: localDateTime,
});

export const timelineSchema = z.object({
  matterId: z.string().uuid(),
  eventType: req(60),
  title: req(250),
  description: optText(4000),
  notes: optText(4000),
  occurredAt: localDateTime,
  documentIds: z.array(z.string().uuid()).max(20).default([]),
});

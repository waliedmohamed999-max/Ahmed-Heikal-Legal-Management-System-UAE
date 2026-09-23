/** Administration schemas shared by settings forms (client) and admin services (server). */
import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email("email").max(200),
  name: z.string().trim().min(1, "required").max(120),
  nameAr: z.string().trim().max(120).optional().or(z.literal("")),
  position: z.string().trim().max(120).optional().or(z.literal("")),
  positionAr: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  roleId: z.string().uuid("required"),
  status: z.enum(["ACTIVE", "SUSPENDED", "INVITED"]).default("ACTIVE"),
  password: z.string().max(200).optional().or(z.literal("")),
});

export const roleSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "required").max(80),
  nameAr: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  matterScope: z.enum(["ALL", "ASSIGNED", "NONE"]),
  permissions: z.array(z.string()).max(200),
});

export const officeSchema = z.object({
  name: z.string().trim().min(1, "required").max(200),
  nameAr: z.string().trim().max(200).optional().or(z.literal("")),
  trn: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("email").optional().or(z.literal("")),
  vatRate: z.coerce.number().min(0).max(100),
  matterPrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, "invalid"),
  invoicePrefix: z.string().trim().regex(/^[A-Z]{1,6}$/, "invalid"),
  hijri: z.boolean(),
});

export const thresholdsSchema = z.object({
  thresholds: z.array(z.object({ level: z.enum(["IMMEDIATE", "CRITICAL", "HIGH", "PRIORITY", "REMINDER"]), minutes: z.coerce.number().int().min(1).max(60 * 24 * 90) })).length(5),
  policies: z.array(z.object({
    subjectType: z.enum(["HEARING", "DEADLINE", "APPOINTMENT", "TASK"]),
    offsetsMinutes: z.array(z.coerce.number().int().min(1).max(60 * 24 * 90)).max(10),
    channels: z.array(z.enum(["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"])).min(1),
    notifyOwner: z.boolean(),
    escalateBeforeMinutes: z.coerce.number().int().min(0).max(60 * 24 * 30).nullable(),
    enabled: z.boolean(),
  })),
});

export const jurisdictionSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), code: z.string().trim().regex(/^[A-Z0-9_]{2,12}$/, "invalid"), name: z.string().trim().min(1, "required").max(120), nameAr: z.string().trim().max(120).optional().or(z.literal("")), kind: z.enum(["FEDERAL", "LOCAL", "FREE_ZONE", "ARBITRATION", "OTHER"]), emirate: z.string().trim().max(60).optional().or(z.literal("")), active: z.boolean() });
export const courtSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), jurisdictionId: z.string().uuid("required"), name: z.string().trim().min(1, "required").max(200), nameAr: z.string().trim().max(200).optional().or(z.literal("")), level: z.string().trim().max(60).optional().or(z.literal("")), emirate: z.string().trim().max(60).optional().or(z.literal("")), active: z.boolean() });
export const caseTypeSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), categoryId: z.string().uuid().optional().or(z.literal("")), code: z.string().trim().regex(/^[A-Z0-9_]{2,24}$/, "invalid"), name: z.string().trim().min(1, "required").max(120), nameAr: z.string().trim().max(120).optional().or(z.literal("")), active: z.boolean() });
export const checklistSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), caseTypeId: z.string().uuid().optional().or(z.literal("")), name: z.string().trim().min(1, "required").max(160), nameAr: z.string().trim().max(160).optional().or(z.literal("")), active: z.boolean(), items: z.array(z.object({ title: z.string().trim().min(1, "required").max(200), titleAr: z.string().trim().max(200).optional().or(z.literal("")), required: z.boolean() })).max(60) });
export const workflowSchema = z.object({ id: z.string().uuid().optional().or(z.literal("")), name: z.string().trim().min(1, "required").max(160), nameAr: z.string().trim().max(160).optional().or(z.literal("")), jurisdictionId: z.string().uuid().optional().or(z.literal("")), caseTypeId: z.string().uuid().optional().or(z.literal("")), isDefault: z.boolean(), stages: z.array(z.object({ key: z.string().trim().regex(/^[A-Z0-9_]{2,30}$/, "invalid"), name: z.string().trim().min(1, "required").max(80), nameAr: z.string().trim().max(80).optional().or(z.literal("")), isTerminal: z.boolean() })).min(1).max(30) });

/** "7d, 3d, 1d, 3h, 30m" ⇄ minutes */
export function parseOffsets(s: string): number[] {
  return s
    .split(/[,،\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => {
      const m = /^(\d+(?:\.\d+)?)\s*([dhm]?)$/.exec(p);
      if (!m) return NaN;
      const n = Number(m[1]);
      return Math.round(m[2] === "d" ? n * 1440 : m[2] === "h" ? n * 60 : n);
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}
export function formatOffsets(mins: number[]) {
  return [...mins].sort((a, b) => b - a).map((m) => (m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`)).join(", ");
}

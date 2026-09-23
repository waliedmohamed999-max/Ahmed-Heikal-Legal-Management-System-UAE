import { z } from "zod";

export const LEAD_SOURCES = ["WEBSITE", "REFERRAL", "PHONE", "WALK_IN", "SOCIAL", "EXISTING_CLIENT", "OTHER"] as const;

export const leadSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "required").max(160),
  email: z.string().trim().email("email").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  source: z.string().max(40).optional().or(z.literal("")),
  inquiry: z.string().max(4000).optional().or(z.literal("")),
  service: z.string().max(160).optional().or(z.literal("")),
  estimatedValue: z.union([z.coerce.number().min(0), z.literal("")]).optional().transform((v) => (v === "" || v == null ? null : v)),
  assignedToId: z.string().uuid().optional().or(z.literal("")),
  stageId: z.string().uuid("required"),
  nextFollowUpAt: z.string().optional().or(z.literal("")),
});

export const bookingSchema = z.object({
  practiceAreaId: z.string().uuid().optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "invalid"),
  mode: z.enum(["ONLINE", "OFFICE"]),
  name: z.string().trim().min(2, "required").max(120),
  phone: z.string().trim().min(6, "required").max(40),
  email: z.string().trim().email("email").max(200),
  description: z.string().trim().max(3000).optional().or(z.literal("")),
  consent: z.literal(true, { message: "required" }),
  website: z.string().max(0).optional(), // honeypot — must stay empty
});


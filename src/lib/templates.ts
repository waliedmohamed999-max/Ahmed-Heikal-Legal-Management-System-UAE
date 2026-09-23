import { z } from "zod";

/** Placeholders a template body may use. Values are resolved server-side from a case the user can access. */
export const TEMPLATE_PLACEHOLDERS = [
  "client.name", "client.nameAr", "client.number",
  "matter.number", "matter.title", "matter.titleAr", "matter.officialNumber", "matter.court", "matter.status",
  "hearing.next", "lawyer.name", "office.name", "office.nameAr", "today",
] as const;
export type PlaceholderKey = (typeof TEMPLATE_PLACEHOLDERS)[number];

export const TEMPLATE_KINDS = ["ENGAGEMENT_LETTER", "LEGAL_NOTICE", "CLIENT_UPDATE", "INTERNAL_MEMO", "MEETING_NOTE", "HEARING_NOTE", "DOCUMENT_REQUEST", "INVOICE_COVER", "CASE_CLOSURE"] as const;
export const KNOWLEDGE_KINDS = ["PRECEDENT", "RESEARCH", "COURT_DECISION", "LEGAL_NOTE", "POLICY", "CHECKLIST", "CLAUSE", "TEMPLATE"] as const;

/**
 * Replace `{{key}}` tokens. Unknown or empty values are left visibly marked
 * (`[[key]]`) so a lawyer can see what still needs filling — nothing is invented.
 */
export function renderTemplate(body: string, values: Partial<Record<PlaceholderKey, string | null | undefined>>) {
  const missing = new Set<string>();
  const text = body.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_, key: string) => {
    const v = values[key as PlaceholderKey];
    if (v == null || v === "") {
      missing.add(key);
      return `[[${key}]]`;
    }
    return v;
  });
  return { text, missing: [...missing] };
}

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
export const templateSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  kind: z.enum(TEMPLATE_KINDS),
  name: z.string().trim().min(1, "required").max(160),
  locale: z.enum(["ar", "en"]),
  body: z.string().trim().min(1, "required").max(50000),
  active: z.boolean(),
});
export const knowledgeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().trim().min(1, "required").max(240),
  body: z.string().trim().min(1, "required").max(100000),
  tags: opt(400),
  locale: z.enum(["ar", "en"]),
  confidentiality: z.enum(["STANDARD", "CONFIDENTIAL"]),
});
export const generateSchema = z.object({ templateId: z.string().uuid(), matterId: z.string().uuid("required") });

import "server-only";
import type { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import type { StaffContext } from "@/server/auth/session";
import { assertMatter, assertPermission, AppError } from "./access";
import { sniff } from "./documents";
import { extract } from "./documents-processing";
import { suggestFromText, type applyImportSchema, type Suggestion } from "@/lib/court-import";
import { fromZonedLocal } from "@/lib/time";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const SOURCE: Record<string, string> = { pdf: "PDF", csv: "CSV", txt: "MANUAL", eml: "EMAIL", docx: "PDF", png: "IMAGE", jpg: "IMAGE", jpeg: "IMAGE", webp: "IMAGE", tif: "IMAGE", tiff: "IMAGE", xls: "EXCEL", xlsx: "EXCEL" };

/**
 * Read the supplied file/text and store heuristic suggestions for review.
 * The file itself is not kept here — attach it to the case as a document if it is needed.
 */
export async function createImport(ctx: StaffContext, input: { matterId?: string | null; text?: string; file?: { name: string; buffer: Buffer } }) {
  assertPermission(ctx, "deadlines.manage");
  if (input.matterId) await assertMatter(ctx, input.matterId, "deadlines.manage");
  let text = input.text ?? "";
  let sourceType = "MANUAL";
  let status: "ok" | "ocrMissing" | "unsupported" = "ok";
  if (input.file) {
    if (input.file.buffer.length > MAX_IMPORT_BYTES) throw new AppError("fileTooLarge", 413);
    const { ext, mime } = sniff(input.file.name, input.file.buffer);
    sourceType = SOURCE[ext] ?? "MANUAL";
    const r = await extract(mime, input.file.buffer);
    if (r.status === "DONE") text = r.text ?? "";
    else status = r.status === "UNAVAILABLE" ? "ocrMissing" : "unsupported";
  }
  const suggestions: Suggestion[] = text ? suggestFromText(text) : [];
  const row = await db.courtImport.create({
    data: { organizationId: ctx.org.id, matterId: input.matterId || null, sourceType, suggestions, createdById: ctx.user.id },
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "court_import.created", entityType: "CourtImport", entityId: row.id, matterId: input.matterId || null, metadata: { sourceType, suggestions: suggestions.length, status } });
  return { id: row.id, status, suggestions, excerpt: text.slice(0, 4000) };
}

/**
 * Apply reviewed items. Dates become deadlines marked NEEDS_VERIFICATION (source IMPORT)
 * with a verification approval; decisions become *proposed* timeline events; a case
 * number only fills an empty official number. Nothing is confirmed automatically.
 */
export async function applyImport(ctx: StaffContext, input: z.output<typeof applyImportSchema>) {
  await assertMatter(ctx, input.matterId, "deadlines.manage");
  const imp = await db.courtImport.findFirst({ where: { id: input.importId, organizationId: ctx.org.id, status: "PENDING_REVIEW" } });
  if (!imp) throw new AppError("notFound", 404);
  const tz = ctx.org.timezone;
  let deadlines = 0, events = 0, caseNumber = false;
  await db.$transaction(async (tx) => {
    for (const it of input.items) {
      if (it.kind === "CASE_NUMBER") {
        const r = await tx.matter.updateMany({ where: { id: input.matterId, officialCaseNumber: null }, data: { officialCaseNumber: it.title.slice(0, 60) } });
        caseNumber ||= r.count > 0;
        continue;
      }
      if (it.kind === "COURT" || !it.date) continue;
      const when = fromZonedLocal(it.date.length > 10 ? it.date : `${it.date}T09:00`, tz);
      if (it.kind === "DECISION") {
        await tx.timelineEvent.create({ data: { matterId: input.matterId, eventType: "COURT_DECISION", occurredAt: when, title: it.title, source: "IMPORT", status: "PROPOSED", userId: ctx.user.id } });
        events++;
        continue;
      }
      const row = await tx.deadline.create({
        data: {
          organizationId: ctx.org.id, matterId: input.matterId, type: it.kind === "HEARING" ? "COURT_APPOINTMENT" : "OTHER", title: it.title,
          description: "Imported from court data — verify against the source document.", dueAt: when, assigneeId: ctx.user.id,
          source: "IMPORT", verification: "NEEDS_VERIFICATION", createdById: ctx.user.id,
        },
      });
      await tx.approval.create({ data: { organizationId: ctx.org.id, kind: "DEADLINE_VERIFICATION", entityType: "Deadline", entityId: row.id, matterId: input.matterId, title: row.title, requestedById: ctx.user.id } });
      deadlines++;
    }
    await tx.courtImport.update({ where: { id: imp.id }, data: { status: "APPLIED", matterId: input.matterId, reviewedById: ctx.user.id, reviewedAt: new Date() } });
  });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "court_import.applied", entityType: "CourtImport", entityId: imp.id, matterId: input.matterId, metadata: { deadlines, events, caseNumber } });
  return { deadlines, events, caseNumber };
}

export async function discardImport(ctx: StaffContext, id: string) {
  assertPermission(ctx, "deadlines.manage");
  const r = await db.courtImport.updateMany({ where: { id, organizationId: ctx.org.id, status: "PENDING_REVIEW" }, data: { status: "DISCARDED", reviewedById: ctx.user.id, reviewedAt: new Date() } });
  if (!r.count) throw new AppError("notFound", 404);
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "court_import.discarded", entityType: "CourtImport", entityId: id });
}

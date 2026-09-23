import "server-only";
import { db } from "../db";
import { storage } from "../storage";

/**
 * Text extraction / OCR pipeline (background). The original file is never modified.
 *  • PDF with a text layer → pdf-parse (per page, for AI citations)
 *  • DOCX → mammoth
 *  • TXT / CSV / EML → UTF-8
 *  • Scanned images → OCR provider adapter; without a configured provider the
 *    version is marked UNAVAILABLE (never silently "done").
 */
export async function extract(mime: string, buf: Buffer): Promise<{ status: "DONE" | "UNAVAILABLE" | "NOT_REQUIRED"; text?: string; pages?: { page: number; text: string }[] }> {
  if (mime === "application/pdf") {
    // Import the library entry directly: the package index runs a debug self-test when bundled.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const pages: { page: number; text: string }[] = [];
    const res = await pdfParse(buf, {
      pagerender: async (pageData: { pageIndex: number; getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }> }) => {
        const tc = await pageData.getTextContent();
        let lastY: number | undefined;
        let text = "";
        for (const it of tc.items) {
          if (lastY !== undefined && lastY !== it.transform[5]) text += "\n";
          text += it.str;
          lastY = it.transform[5];
        }
        pages.push({ page: pageData.pageIndex + 1, text });
        return text;
      },
    } as never);
    const text = res.text?.trim() ?? "";
    if (!text) return ocr(mime, buf);
    return { status: "DONE", text, pages: pages.sort((a, b) => a.page - b.page) };
  }
  if (mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    return { status: "DONE", text: r.value, pages: [{ page: 1, text: r.value }] };
  }
  if (mime.startsWith("text/") || mime === "message/rfc822") {
    const text = buf.toString("utf8");
    return { status: "DONE", text, pages: [{ page: 1, text }] };
  }
  if (mime.startsWith("image/")) return ocr(mime, buf);
  return { status: "NOT_REQUIRED" };
}

/** OCR adapter: plug a provider in here (e.g. a hosted OCR API) via OCR_PROVIDER. */
async function ocr(_mime: string, _buf: Buffer): Promise<{ status: "UNAVAILABLE" }> {
  // No provider bundled; honest status instead of fake text.
  return { status: "UNAVAILABLE" };
}

export async function processPendingDocuments(limit = 5) {
  const pending = await db.documentVersion.findMany({ where: { textStatus: "PENDING" }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  let done = 0;
  for (const { id } of pending) {
    const claimed = await db.documentVersion.updateMany({ where: { id, textStatus: "PENDING" }, data: { textStatus: "PROCESSING" } });
    if (!claimed.count) continue;
    const v = await db.documentVersion.findUniqueOrThrow({ where: { id }, include: { document: { select: { id: true, currentVersion: true } } } });
    try {
      const buf = await storage().get(v.storageKey);
      const r = await extract(v.mimeType, buf);
      const text = r.text?.slice(0, 2_000_000) ?? null;
      await db.documentVersion.update({ where: { id }, data: { textStatus: r.status, extractedText: text, pageTexts: r.pages ?? undefined, pageCount: r.pages?.length ?? null } });
      if (v.version === v.document.currentVersion) await db.document.update({ where: { id: v.document.id }, data: { searchText: text } });
      done++;
    } catch (e) {
      console.error("[documents] extraction failed", id, e instanceof Error ? e.message : e);
      await db.documentVersion.update({ where: { id }, data: { textStatus: "FAILED" } });
    }
  }
  return done;
}

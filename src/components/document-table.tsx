"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, FileSpreadsheet, FileImage, FileArchive, Mail, Lock, Upload, Globe } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Badge, DOC_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Uploader } from "@/components/uploader";
import { formatBytes } from "@/lib/utils";
import { relativeTime } from "@/lib/time";

export type DocRow = {
  id: string; title: string; category: string; status: string; confidentiality: string; tags: string[]; currentVersion: number; portalShared: boolean; updatedAt: string;
  matter: { id: string; internalNumber: string; title: string; titleAr: string | null } | null;
  latest: { fileName: string; sizeBytes: number; mimeType: string; textStatus: string; uploadedBy: { name: string; nameAr: string | null } | null } | null;
  snippet: string | null;
};

export function fileIcon(mime?: string) {
  if (!mime) return FileText;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return FileSpreadsheet;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("zip")) return FileArchive;
  if (mime.includes("rfc822") || mime.includes("outlook")) return Mail;
  return FileText;
}

export function DocumentTable({ rows, showMatter = true, canUpload, matterId, matterLabel, suggest, autoOpenUpload, emptyTitle }: {
  rows: DocRow[]; showMatter?: boolean; canUpload: boolean; matterId?: string; matterLabel?: string; suggest?: { number?: string | null; client?: string | null }; autoOpenUpload?: boolean; emptyTitle?: string;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(!!autoOpenUpload && canUpload);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <>
      {canUpload && (
        <div className="flex justify-end border-b border-line px-4 py-2">
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Upload /> {t("documents.upload")}</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<FileText />} title={emptyTitle ?? t("documents.empty")} body={t("documents.emptyBody")} action={canUpload && <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Upload /> {t("documents.upload")}</Button>} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("documents.col.document")}</TH>
              {showMatter && <TH className="hidden lg:table-cell">{t("documents.col.case")}</TH>}
              <TH className="hidden md:table-cell">{t("documents.col.category")}</TH>
              <TH>{t("documents.col.status")}</TH>
              <TH className="hidden sm:table-cell">{t("documents.col.version")}</TH>
              <TH className="hidden md:table-cell">{t("documents.col.updated")}</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((d) => {
              const Icon = fileIcon(d.latest?.mimeType);
              return (
                <TR key={d.id}>
                  <TD className="max-w-[420px]">
                    <Link href={`/app/documents/${d.id}`} className="flex items-center gap-2.5">
                      <Icon className="size-5 shrink-0 text-ink-subtle" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          {d.confidentiality !== "STANDARD" && <Lock className="size-3.5 shrink-0 text-warning" />}
                          <span className="truncate font-medium text-ink hover:underline">{d.title}</span>
                          {d.portalShared && <Globe className="size-3.5 shrink-0 text-info" aria-label={t("documents.fields.portalShared")} />}
                        </span>
                        <span className="ltr-nums block truncate text-[11.5px] text-ink-subtle">{d.snippet ?? `${d.latest?.fileName ?? ""} · ${formatBytes(d.latest?.sizeBytes ?? 0)}`}</span>
                        {d.tags.length > 0 && <span className="mt-0.5 flex flex-wrap gap-1">{d.tags.slice(0, 4).map((tg) => <Badge key={tg} tone="outline">{tg}</Badge>)}</span>}
                      </span>
                    </Link>
                  </TD>
                  {showMatter && <TD className="hidden max-w-[220px] lg:table-cell">{d.matter ? <Link href={`/app/cases/${d.matter.id}/documents`} className="block truncate text-ink-muted hover:underline"><span className="ltr-nums font-mono text-[11.5px]">{d.matter.internalNumber}</span> · {L(d.matter.title, d.matter.titleAr)}</Link> : <span className="text-ink-subtle">—</span>}</TD>}
                  <TD className="hidden text-ink-muted md:table-cell">{t(`enums.documentCategory.${d.category}`)}</TD>
                  <TD><Badge tone={DOC_STATUS_TONE[d.status]}>{t(`enums.documentStatus.${d.status}`)}</Badge></TD>
                  <TD className="hidden tabular text-ink-muted sm:table-cell">v{d.currentVersion}</TD>
                  <TD className="hidden text-ink-muted md:table-cell">{relativeTime(d.updatedAt, locale)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent title={t("documents.uploadTitle")} size="lg">
            <Uploader matterId={matterId} matterLabel={matterLabel} suggest={suggest} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, FileSpreadsheet, FileImage, FileArchive, Mail, Lock, Upload, Globe, List, LayoutGrid } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { StatusText, DOC_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Segmented } from "@/components/ui/layout";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Uploader } from "@/components/uploader";
import { formatBytes, cn } from "@/lib/utils";
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

/**
 * Document manager list: toolbar slot (search/filters), List/Grid switch, upload.
 * No per-file thumbnails — a small type icon only.
 */
export function DocumentTable({ rows, showMatter = true, canUpload, matterId, matterLabel, suggest, autoOpenUpload, emptyTitle, toolbar, footer }: {
  rows: DocRow[]; showMatter?: boolean; canUpload: boolean; matterId?: string; matterLabel?: string; suggest?: { number?: string | null; client?: string | null }; autoOpenUpload?: boolean; emptyTitle?: string;
  toolbar?: React.ReactNode; footer?: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(!!autoOpenUpload && canUpload);
  const [view, setView] = useState<"list" | "grid">("list");
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const uploadBtn = canUpload && <Button size="md" variant="primary" onClick={() => setOpen(true)}><Upload /> {t("documents.upload")}</Button>;

  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <div className="flex items-center gap-1.5">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: <span className="sr-only">{t("shell.list")}</span>, icon: <List aria-label={t("shell.list")} /> },
              { value: "grid", label: <span className="sr-only">{t("shell.grid")}</span>, icon: <LayoutGrid aria-label={t("shell.grid")} /> },
            ]}
          />
          {uploadBtn}
        </div>
      </div>

      <div className="-mx-4 mt-3 border-y border-line sm:mx-0 sm:rounded-lg sm:border">
        {rows.length === 0 ? (
          <EmptyState icon={<FileText />} title={emptyTitle ?? t("documents.empty")} body={t("documents.emptyBody")} action={canUpload && <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Upload /> {t("documents.upload")}</Button>} />
        ) : view === "grid" ? (
          <ul className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((d) => {
              const Icon = fileIcon(d.latest?.mimeType);
              return (
                <li key={d.id} className="bg-surface">
                  <Link href={`/app/documents/${d.id}`} className="flex h-full flex-col gap-2 p-3 transition-colors hover:bg-surface-muted">
                    <div className="flex items-start gap-2.5">
                      <Icon className="mt-0.5 size-5 shrink-0 text-ink-subtle" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {d.confidentiality !== "STANDARD" && <Lock className="size-3 shrink-0 text-warning" aria-label={t(`enums.confidentiality.${d.confidentiality}`)} />}
                          <span className="bidi-plain line-clamp-2 text-body font-medium text-ink">{d.title}</span>
                        </div>
                        <div className="mt-0.5 truncate text-meta text-ink-subtle">{t(`enums.documentCategory.${d.category}`)} · v{d.currentVersion}</div>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 text-meta">
                      {d.matter ? <span className="record-id truncate text-ink-subtle">{d.matter.internalNumber}</span> : <span />}
                      <StatusText tone={DOC_STATUS_TONE[d.status]} className="text-meta">{t(`enums.documentStatus.${d.status}`)}</StatusText>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table>
                <THead>
                  <tr>
                    <TH>{t("documents.col.document")}</TH>
                    {showMatter && <TH className="hidden lg:table-cell">{t("documents.col.case")}</TH>}
                    <TH className="hidden md:table-cell">{t("documents.col.category")}</TH>
                    <TH className="hidden xl:table-cell">{t("documents.col.version")}</TH>
                    <TH className="hidden 2xl:table-cell">{t("home.owner")}</TH>
                    <TH className="hidden md:table-cell">{t("documents.col.updated")}</TH>
                    <TH>{t("documents.col.status")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((d) => {
                    const Icon = fileIcon(d.latest?.mimeType);
                    return (
                      <TR key={d.id}>
                        <TD className="min-w-[240px] max-w-[400px] py-1.5">
                          <Link href={`/app/documents/${d.id}`} className="group/link flex items-center gap-2.5">
                            <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                {d.confidentiality !== "STANDARD" && <Lock className="size-3 shrink-0 text-warning" aria-label={t(`enums.confidentiality.${d.confidentiality}`)} />}
                                <span className="bidi-plain truncate font-medium text-ink group-hover/link:underline">{d.title}</span>
                                {d.portalShared && <Globe className="size-3 shrink-0 text-info" aria-label={t("documents.fields.portalShared")} />}
                              </span>
                              <span className={cn("block truncate text-meta text-ink-subtle", !d.snippet && "ltr-nums")}>{d.snippet ?? `${d.latest?.fileName ?? ""} · ${formatBytes(d.latest?.sizeBytes ?? 0)}`}</span>
                            </span>
                          </Link>
                        </TD>
                        {showMatter && (
                          <TD className="hidden max-w-[200px] lg:table-cell">
                            {d.matter ? (
                              <Link href={`/app/cases/${d.matter.id}/documents`} className="block truncate text-ink-muted hover:text-ink hover:underline">
                                <span className="record-id text-ink-subtle">{d.matter.internalNumber}</span> <span className="bidi-plain">{L(d.matter.title, d.matter.titleAr)}</span>
                              </Link>
                            ) : <span className="text-ink-subtle">—</span>}
                          </TD>
                        )}
                        <TD className="hidden whitespace-nowrap text-ink-muted md:table-cell">{t(`enums.documentCategory.${d.category}`)}</TD>
                        <TD className="hidden tabular text-ink-muted xl:table-cell">v{d.currentVersion}</TD>
                        <TD className="hidden max-w-[140px] truncate text-ink-muted 2xl:table-cell">{d.latest?.uploadedBy ? L(d.latest.uploadedBy.name, d.latest.uploadedBy.nameAr) : "—"}</TD>
                        <TD className="hidden whitespace-nowrap text-ink-muted md:table-cell">{relativeTime(d.updatedAt, locale)}</TD>
                        <TD><StatusText tone={DOC_STATUS_TONE[d.status]}>{t(`enums.documentStatus.${d.status}`)}</StatusText></TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            {/* Phones: compact records */}
            <ul className="divide-y divide-line sm:hidden">
              {rows.map((d) => {
                const Icon = fileIcon(d.latest?.mimeType);
                return (
                  <li key={d.id}>
                    <Link href={`/app/documents/${d.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-surface-muted">
                      <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="bidi-plain block text-body font-medium text-ink">{d.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-meta text-ink-subtle">
                          {d.matter && <span className="record-id">{d.matter.internalNumber}</span>}
                          <span>· {relativeTime(d.updatedAt, locale)}</span>
                        </span>
                      </span>
                      <StatusText tone={DOC_STATUS_TONE[d.status]} className="shrink-0 text-meta">{t(`enums.documentStatus.${d.status}`)}</StatusText>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {rows.length > 0 && footer}
      </div>

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

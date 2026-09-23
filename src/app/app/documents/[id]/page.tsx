import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, History, ShieldCheck, Lock, MessageSquare } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getDocumentDetail } from "@/server/services/documents";
import { signedFileUrl } from "@/server/storage";
import { AppError } from "@/server/errors";
import { Panel, EmptyState, Avatar } from "@/components/ui/layout";
import { Badge, DOC_STATUS_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, relativeTime } from "@/lib/time";
import { formatBytes } from "@/lib/utils";
import { DocumentActions, DocumentComments } from "./client";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  let d;
  try {
    d = await getDocumentDetail(ctx, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const doc = d.doc;
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;
  const current = doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[0];
  const previewable = current && (current.mimeType === "application/pdf" || current.mimeType.startsWith("image/") || current.mimeType === "text/plain");
  const previewUrl = current && previewable ? signedFileUrl(current.id, ctx.user.id, "inline") : null;
  const Back = locale === "ar" ? ChevronRight : ChevronLeft;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <Link href={doc.matter ? `/app/cases/${doc.matter.id}/documents` : "/app/documents"} className="inline-flex items-center gap-1 text-[12.5px] text-ink-subtle hover:text-ink">
        <Back className="size-3.5" /> {doc.matter ? doc.matter.internalNumber : t("documents.title")}
      </Link>
      <header className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={DOC_STATUS_TONE[doc.status]}>{t(`enums.documentStatus.${doc.status}`)}</Badge>
            <Badge tone="outline">v{doc.currentVersion}</Badge>
            <span className="text-[12px] text-ink-subtle">{t(`enums.documentCategory.${doc.category}`)}</span>
            {doc.confidentiality !== "STANDARD" && <Badge tone="warning"><Lock /> {t(`enums.confidentiality.${doc.confidentiality}`)}</Badge>}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-ink">{doc.title}</h1>
          {doc.matter && <Link href={`/app/cases/${doc.matter.id}`} className="text-[13px] text-accent hover:underline"><span className="ltr-nums font-mono">{doc.matter.internalNumber}</span> · {L(doc.matter.title, doc.matter.titleAr)}</Link>}
        </div>
        {current && d.access.download && (
          <Button asChild variant="secondary"><a href={signedFileUrl(current.id, ctx.user.id, "attachment")}><Download /> {t("documents.download")}</a></Button>
        )}
      </header>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
            {previewUrl ? (
              current!.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={doc.title} className="mx-auto max-h-[75vh] object-contain" />
              ) : (
                <iframe src={previewUrl} title={t("documents.preview")} className="h-[75vh] w-full bg-surface-muted" />
              )
            ) : (
              <EmptyState title={t("documents.previewUnavailable")} />
            )}
          </div>
          {current?.extractedText && (
            <Panel title={t("documents.extractedText")}>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-4 font-sans text-[12.5px] leading-relaxed text-ink-muted scrollbar-thin">{current.extractedText.slice(0, 20000)}</pre>
            </Panel>
          )}
          <Panel title={t("tasks.comments")} icon={<MessageSquare />}>
            <DocumentComments documentId={doc.id} comments={doc.comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: L(c.author.name, c.author.nameAr), photoUrl: c.author.photoUrl }))} />
          </Panel>
        </div>

        <div className="space-y-5 xl:col-span-4">
          <DocumentActions
            doc={{ id: doc.id, title: doc.title, description: doc.description, category: doc.category, tags: doc.tags, confidentiality: doc.confidentiality, portalShared: doc.portalShared, matterId: doc.matterId }}
            transitions={d.transitions}
            caps={d.caps}
            canEdit={d.access.edit}
          />

          <Panel title={t("documents.versions")} icon={<History />}>
            <ol className="divide-y divide-line">
              {doc.versions.map((v) => (
                <li key={v.id} className="space-y-1 px-4 py-3 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">v{v.version} {v.version === doc.currentVersion && <Badge tone="info">{t("documents.current")}</Badge>}</span>
                    <Badge tone={DOC_STATUS_TONE[v.status]}>{t(`enums.documentStatus.${v.status}`)}</Badge>
                  </div>
                  <p className="ltr-nums truncate text-ink-muted">{v.fileName}</p>
                  <p className="text-ink-subtle">{t("documents.uploadedBy")} {v.uploadedBy ? L(v.uploadedBy.name, v.uploadedBy.nameAr) : "—"} · {formatDateTime(v.createdAt, locale, tz)} · {formatBytes(v.sizeBytes)}</p>
                  <p className="ltr-nums truncate font-mono text-[10.5px] text-ink-subtle" title={v.checksumSha256}>{t("documents.checksum")}: {v.checksumSha256.slice(0, 24)}…</p>
                  <p className="text-ink-subtle">{t("documents.textStatus")}: {t(`enums.processingStatus.${v.textStatus}`)}</p>
                  {v.comment && <p className="rounded bg-surface-muted px-2 py-1 text-ink-muted">{v.comment}</p>}
                  {d.access.download && <a href={signedFileUrl(v.id, ctx.user.id, "attachment")} className="inline-flex items-center gap-1 text-accent hover:underline"><Download className="size-3" /> {t("documents.download")}</a>}
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title={t("documents.approvals")} icon={<ShieldCheck />}>
            {d.approvals.length === 0 ? <EmptyState compact title="—" /> : (
              <ul className="divide-y divide-line">
                {d.approvals.map((a) => (
                  <li key={a.id} className="flex gap-2.5 px-4 py-2.5 text-[12.5px]">
                    <Avatar name={a.requestedBy?.name ?? "—"} size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="text-ink">{a.title}</p>
                      <p className="text-ink-subtle">{a.requestedBy ? L(a.requestedBy.name, a.requestedBy.nameAr) : "—"} → {a.assignedTo ? L(a.assignedTo.name, a.assignedTo.nameAr) : "—"} · {relativeTime(a.createdAt, locale)}</p>
                      {a.comment && <p className="mt-0.5 text-ink-muted">“{a.comment}”</p>}
                    </div>
                    <Badge tone={a.status === "APPROVED" ? "success" : a.status === "PENDING" ? "info" : a.status === "CHANGES_REQUESTED" ? "warning" : "outline"}>{t(`enums.requestStatus.${a.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

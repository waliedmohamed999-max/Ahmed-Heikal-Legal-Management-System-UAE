import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ShieldAlert, ChevronLeft, ChevronRight, Gavel } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace } from "@/server/services/workspace";
import { Avatar } from "@/components/ui/layout";
import { Badge, StatusText, PriorityText, MATTER_STATUS_TONE } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/overlay";
import { CountdownInline } from "@/components/countdown";
import { formatDate, formatTime } from "@/lib/time";
import { WorkspaceTabs } from "./tabs";
import { RequestAccess } from "./request-access";
import { WorkspaceActions } from "./workspace-actions";

export default async function CaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const ws = await loadWorkspace(ctx, id);
  if (ws.state === "missing") notFound();
  if (ws.state === "restricted") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <Lock className="mx-auto size-6 text-warning" aria-hidden />
        <h1 className="mt-3 text-heading font-semibold text-ink">{t("errors.noAccessTitle")}</h1>
        {ws.label && <p className="record-id mt-1 text-ink-subtle">{ws.label.internalNumber}</p>}
        <p className="mx-auto mt-2 max-w-sm text-body text-ink-muted">{t("errors.noAccessBody")}</p>
        <div className="mt-6">
          <RequestAccess matterId={id} pending={ws.pending} />
        </div>
      </div>
    );
  }

  const m = ws.matter;
  const caps = new Set(ws.caps);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;
  const Sep = locale === "ar" ? ChevronLeft : ChevronRight;
  const base = `/app/cases/${m.id}`;
  const tabs = [
    { key: "overview", href: base, label: t("workspace.tabs.overview") },
    { key: "timeline", href: `${base}/timeline`, label: t("workspace.tabs.timeline") },
    { key: "hearings", href: `${base}/hearings`, label: t("workspace.tabs.hearings"), count: m._count.hearings },
    { key: "deadlines", href: `${base}/deadlines`, label: t("workspace.tabs.deadlines"), count: m._count.deadlines },
    ...(caps.has("documents.view") ? [{ key: "documents", href: `${base}/documents`, label: t("workspace.tabs.documents"), count: m._count.documents }] : []),
    { key: "tasks", href: `${base}/tasks`, label: t("workspace.tabs.tasks"), count: m._count.tasks },
    ...(caps.has("notes.view") ? [{ key: "notes", href: `${base}/notes`, label: t("workspace.tabs.notes"), count: m._count.notes }] : []),
    { key: "communications", href: `${base}/communications`, label: t("workspace.tabs.communications"), count: m._count.communications },
    ...(caps.has("finance.view") ? [{ key: "finance", href: `${base}/finance`, label: t("workspace.tabs.finance") }] : []),
    { key: "team", href: `${base}/team`, label: t("ws.people"), count: m.members.length },
    ...(ctx.can("audit.view") ? [{ key: "audit", href: `/app/audit?q=${encodeURIComponent(m.internalNumber)}`, label: t("ws.audit") }] : []),
  ];

  const meta: { key: string; label: string; value: React.ReactNode }[] = [
    { key: "client", label: t("workspace.client"), value: <Link href={`/app/clients/${m.client.id}`} className="hover:underline">{L(m.client.nameEn, m.client.nameAr)}</Link> },
    { key: "court", label: t("workspace.court"), value: m.court ? L(m.court.name, m.court.nameAr) : m.jurisdiction ? L(m.jurisdiction.name, m.jurisdiction.nameAr) : "—" },
    {
      key: "lead",
      label: t("workspace.lawyer"),
      value: m.leadLawyer ? (
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={m.leadLawyer.name} src={m.leadLawyer.photoUrl} size={16} /> {L(m.leadLawyer.name, m.leadLawyer.nameAr)}
        </span>
      ) : "—",
    },
    {
      key: "next",
      label: t("workspace.nextHearing"),
      value: m.nextHearing ? (
        <Link href={`${base}/hearings?h=${m.nextHearing.id}`} className="inline-flex items-center gap-1.5 hover:underline">
          <Gavel className="size-3 text-ev-hearing" aria-hidden />
          <span className="tabular">{formatDate(m.nextHearing.startsAt, locale, tz, { day: "numeric", month: "short", year: undefined })} · {formatTime(m.nextHearing.startsAt, locale, tz)}</span>
          <CountdownInline target={m.nextHearing.startsAt.toISOString()} />
        </Link>
      ) : "—",
    },
  ];

  return (
    <div className="min-h-full">
      <header className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-meta text-ink-subtle">
          <Link href="/app/cases" className="hover:text-ink">{t("ws.back")}</Link>
          <Sep className="size-3" aria-hidden />
          <span className="record-id text-ink-muted">{m.internalNumber}</span>
          {m.officialCaseNumber && <span className="record-id hidden text-ink-subtle sm:inline">· {m.officialCaseNumber}</span>}
        </nav>

        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="bidi-plain flex items-start gap-2 text-title font-semibold leading-snug tracking-tight text-ink">
              {m.confidentiality !== "STANDARD" && (
                <Tooltip content={m.confidentiality === "HIGHLY_CONFIDENTIAL" ? t("workspace.confidentialBanner") : t(`enums.confidentiality.${m.confidentiality}`)}>
                  <span className="mt-1.5 shrink-0 text-warning">
                    {m.confidentiality === "HIGHLY_CONFIDENTIAL" ? <ShieldAlert className="size-4" aria-label={t("enums.confidentiality.HIGHLY_CONFIDENTIAL")} /> : <Lock className="size-4" aria-label={t("enums.confidentiality.CONFIDENTIAL")} />}
                  </span>
                </Tooltip>
              )}
              <span className="min-w-0">{L(m.title, m.titleAr)}</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
              <StatusText tone={MATTER_STATUS_TONE[m.status]} className="text-meta">{t(`enums.matterStatus.${m.status}`)}</StatusText>
              <PriorityText priority={m.priority} label={t(`enums.priority.${m.priority}`)} className="text-meta" />
              <span className="text-ink-subtle">{m.caseType ? L(m.caseType.name, m.caseType.nameAr) : t(`enums.matterKind.${m.kind}`)}</span>
              {m.stage && <span className="text-ink-subtle">· {L(m.stage.name, m.stage.nameAr)}</span>}
              {m.confidentiality === "HIGHLY_CONFIDENTIAL" && <Badge tone="warning"><Lock /> {t("enums.confidentiality.HIGHLY_CONFIDENTIAL")}</Badge>}
            </div>
          </div>
          <WorkspaceActions matterId={m.id} status={m.status} caps={[...caps]} />
        </div>

        {/* Key facts — one quiet line, wraps on small screens */}
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-body">
          {meta.map((x) => (
            <div key={x.key} className="flex min-w-0 max-w-full items-baseline gap-1.5">
              <dt className="shrink-0 text-meta text-ink-subtle">{x.label}</dt>
              <dd className="min-w-0 truncate text-ink">{x.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* Sticky sub-navigation */}
      <div className="sticky top-12 z-20 mt-3 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <WorkspaceTabs tabs={tabs} base={base} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">{children}</div>
    </div>
  );
}

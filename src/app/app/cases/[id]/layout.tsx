import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ShieldAlert, ChevronLeft, ChevronRight, Gavel, CalendarClock } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace } from "@/server/services/workspace";
import { Avatar, Meta } from "@/components/ui/layout";
import { Badge, PRIORITY_TONE, MATTER_STATUS_TONE } from "@/components/ui/badge";
import { CountdownInline } from "@/components/countdown";
import { formatDate, formatDateTime, formatMoney, relativeTime } from "@/lib/time";
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
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-lg border border-line bg-surface p-8 text-center shadow-xs">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
            <Lock className="size-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-ink">{t("errors.noAccessTitle")}</h1>
          {ws.label && <p className="ltr-nums mt-1 font-mono text-[12.5px] text-ink-subtle">{ws.label.internalNumber}</p>}
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{t("errors.noAccessBody")}</p>
          <div className="mt-6">
            <RequestAccess matterId={id} pending={ws.pending} />
          </div>
        </div>
      </div>
    );
  }

  const m = ws.matter;
  const caps = new Set(ws.caps);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;
  const opponents = m.parties.filter((p) => p.role === "OPPONENT");
  const Back = locale === "ar" ? ChevronRight : ChevronLeft;
  const base = `/app/cases/${m.id}`;
  const tabs = [
    { key: "overview", href: base, label: t("workspace.tabs.overview") },
    { key: "timeline", href: `${base}/timeline`, label: t("workspace.tabs.timeline") },
    { key: "hearings", href: `${base}/hearings`, label: t("workspace.tabs.hearings"), count: m._count.hearings },
    { key: "deadlines", href: `${base}/deadlines`, label: t("workspace.tabs.deadlines"), count: m._count.deadlines },
    { key: "tasks", href: `${base}/tasks`, label: t("workspace.tabs.tasks"), count: m._count.tasks },
    ...(caps.has("documents.view") ? [{ key: "documents", href: `${base}/documents`, label: t("workspace.tabs.documents"), count: m._count.documents }] : []),
    ...(caps.has("notes.view") ? [{ key: "notes", href: `${base}/notes`, label: t("workspace.tabs.notes"), count: m._count.notes }] : []),
    { key: "communications", href: `${base}/communications`, label: t("workspace.tabs.communications"), count: m._count.communications },
    ...(caps.has("finance.view") ? [{ key: "finance", href: `${base}/finance`, label: t("workspace.tabs.finance") }] : []),
    { key: "team", href: `${base}/team`, label: t("workspace.tabs.team"), count: m.members.length },
  ];

  return (
    <div className="min-h-full">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-6 lg:px-8">
          <Link href="/app/cases" className="inline-flex items-center gap-1 text-[12.5px] text-ink-subtle hover:text-ink">
            <Back className="size-3.5" /> {t("cases.title")}
          </Link>
          {m.confidentiality === "HIGHLY_CONFIDENTIAL" && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              <ShieldAlert className="size-4" /> {t("workspace.confidentialBanner")}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ltr-nums rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[12px] font-medium text-ink-muted">{m.internalNumber}</span>
                <Badge tone={MATTER_STATUS_TONE[m.status]}>{t(`enums.matterStatus.${m.status}`)}</Badge>
                <Badge tone={PRIORITY_TONE[m.priority]}>{t(`enums.priority.${m.priority}`)}</Badge>
                {m.confidentiality !== "STANDARD" && (
                  <Badge tone="warning">
                    <Lock /> {t(`enums.confidentiality.${m.confidentiality}`)}
                  </Badge>
                )}
                <span className="text-[12px] text-ink-subtle">{t(`enums.matterKind.${m.kind}`)}</span>
              </div>
              <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-ink sm:text-[22px]">{L(m.title, m.titleAr)}</h1>
              {locale === "ar" && m.titleAr && <p className="mt-0.5 text-[13px] text-ink-subtle" dir="ltr">{m.title}</p>}
            </div>
            <WorkspaceActions matterId={m.id} status={m.status} caps={[...caps]} />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            <Meta label={t("workspace.client")}>
              <Link href={`/app/clients/${m.client.id}`} className="hover:underline">{L(m.client.nameEn, m.client.nameAr)}</Link>
            </Meta>
            <Meta label={t("workspace.opponent")}>{opponents.length ? opponents.map((o) => L(o.contact.nameEn, o.contact.nameAr)).join("، ") : "—"}</Meta>
            <Meta label={t("workspace.court")}>{m.court ? L(m.court.name, m.court.nameAr) : m.jurisdiction ? L(m.jurisdiction.name, m.jurisdiction.nameAr) : "—"}</Meta>
            <Meta label={t("workspace.officialNumber")}><span className="ltr-nums font-mono text-[12.5px]">{m.officialCaseNumber ?? "—"}</span></Meta>
            <Meta label={t("workspace.caseType")}>{m.caseType ? L(m.caseType.name, m.caseType.nameAr) : "—"}</Meta>
            <Meta label={t("workspace.stage")}>{m.stage ? L(m.stage.name, m.stage.nameAr) : "—"}</Meta>
            <Meta label={t("workspace.lawyer")}>
              {m.leadLawyer ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={m.leadLawyer.name} src={m.leadLawyer.photoUrl} size={20} /> {L(m.leadLawyer.name, m.leadLawyer.nameAr)}
                </span>
              ) : "—"}
            </Meta>
            <Meta label={t("workspace.team")}>
              <span className="flex -space-x-1.5 rtl:space-x-reverse">
                {m.members.slice(0, 6).map((mm) => (
                  <Avatar key={mm.id} name={L(mm.user.name, mm.user.nameAr)} src={mm.user.photoUrl} size={22} />
                ))}
              </span>
            </Meta>
            <Meta label={t("workspace.nextHearing")}>
              {m.nextHearing ? (
                <Link href={`${base}/hearings?h=${m.nextHearing.id}`} className="inline-flex flex-wrap items-center gap-x-2 hover:underline">
                  <Gavel className="size-3.5 text-ev-hearing" /> {formatDateTime(m.nextHearing.startsAt, locale, tz)}
                  <CountdownInline target={m.nextHearing.startsAt.toISOString()} />
                </Link>
              ) : "—"}
            </Meta>
            <Meta label={t("workspace.nextDeadline")}>
              {m.nextDeadline ? (
                <Link href={`${base}/deadlines`} className="inline-flex flex-wrap items-center gap-x-2 hover:underline">
                  <CalendarClock className="size-3.5 text-high" /> {formatDate(m.nextDeadline.dueAt, locale, tz)}
                  <CountdownInline target={m.nextDeadline.dueAt.toISOString()} />
                </Link>
              ) : "—"}
            </Meta>
            {caps.has("finance.view") && m.claimAmount != null && <Meta label={t("workspace.claimValue")}><span className="ltr-nums">{formatMoney(m.claimAmount, locale, m.currency)}</span></Meta>}
            <Meta label={t("workspace.lastUpdate")}>{relativeTime(m.lastActivityAt, locale)}</Meta>
          </dl>

          <WorkspaceTabs tabs={tabs} base={base} className="mt-4" />
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

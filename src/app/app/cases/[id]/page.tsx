import { stringList } from "@/lib/json-lists";
import Link from "next/link";
import { FileText, Gavel, CalendarClock, Circle, Globe, Flag, Lock } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace } from "@/server/services/workspace";
import { matterHealth } from "@/server/services/health";
import { documentScope } from "@/server/services/documents";
import { db } from "@/server/db";
import { Panel, Avatar, EmptyState, DetailList, SectionLink, Timeline } from "@/components/ui/layout";
import { Badge, StatusText, DOC_STATUS_TONE } from "@/components/ui/badge";
import { CountdownInline } from "@/components/countdown";
import { formatDate, formatTime, formatMoney, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PartiesPanel, ChecklistPanel } from "./overview-client";

export default async function CaseOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const ws = await loadWorkspace(ctx, id);
  if (ws.state !== "ok") return null; // the layout renders the restricted / missing state
  const m = ws.matter;
  const caps = new Set(ws.caps);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;
  const base = `/app/cases/${id}`;

  const [health, checklist, events, tasks, docs] = await Promise.all([
    matterHealth(id),
    db.matterChecklistItem.findMany({ where: { matterId: id }, orderBy: { order: "asc" } }),
    db.timelineEvent.findMany({ where: { matterId: id, status: { not: "REJECTED" } }, orderBy: { occurredAt: "desc" }, take: 5 }),
    caps.has("tasks.view")
      ? db.task.findMany({
          where: { matterId: id, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } },
          orderBy: [{ dueAt: "asc" }],
          take: 6,
          select: { id: true, title: true, dueAt: true, priority: true, assignee: { select: { name: true, nameAr: true, photoUrl: true } } },
        })
      : [],
    caps.has("documents.view")
      ? db.document.findMany({ where: { AND: [documentScope(ctx), { matterId: id }] }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, status: true, updatedAt: true, confidentiality: true } })
      : [],
  ]);
  const done = checklist.filter((c) => c.doneAt).length;
  const now = new Date();
  const opponents = m.parties.filter((p) => p.role === "OPPONENT");

  const update = [
    { label: t("workspace.currentStatus"), value: m.currentStatusText },
    { label: t("workspace.lastAction"), value: m.lastActionText },
    { label: t("workspace.nextAction"), value: m.nextActionText },
  ];

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
      {/* ── Main column ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-8">
        <section aria-labelledby="summary">
          <h2 id="summary" className="text-heading font-semibold text-ink">{t("workspace.summary")}</h2>
          {m.summary ? (
            <p className="bidi-plain mt-2 max-w-3xl whitespace-pre-line text-ui leading-relaxed text-ink">{m.summary}</p>
          ) : (
            <p className="mt-2 text-body text-ink-subtle">{t("common.notSet")}</p>
          )}
          {(m.claims || (caps.has("finance.view") && m.claimAmount != null)) && (
            <p className="mt-3 text-body text-ink-muted">
              <span className="text-ink-subtle">{t("workspace.claims")}: </span>
              {m.claims && <span className="bidi-plain">{m.claims}</span>}
              {caps.has("finance.view") && m.claimAmount != null && <span className="ltr-nums ms-1 font-medium text-ink">{formatMoney(m.claimAmount, locale, m.currency)}</span>}
            </p>
          )}
        </section>

        <section aria-labelledby="update">
          <h2 id="update" className="border-b border-line pb-2 text-body font-semibold text-ink">{t("ws.latestUpdate")}</h2>
          <dl className="divide-y divide-line/70">
            {update.map((u) => (
              <div key={u.label} className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
                <dt className="text-meta text-ink-subtle sm:pt-px">{u.label}</dt>
                <dd className={cn("bidi-plain whitespace-pre-line text-body", u.value ? "text-ink" : "text-ink-subtle")}>{u.value || "—"}</dd>
              </div>
            ))}
          </dl>
          {m.internalNotes && (
            <div className="mt-3 flex gap-2 rounded-md bg-surface-muted px-3 py-2 text-body">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
              <p className="bidi-plain whitespace-pre-line text-ink-muted"><span className="font-medium text-ink">{t("workspace.internalNotes")}: </span>{m.internalNotes}</p>
            </div>
          )}
        </section>

        <Panel plain title={t("ws.recentTimeline")} actions={<SectionLink href={`${base}/timeline`}>{t("ws.viewTimeline")}</SectionLink>}>
          {events.length ? (
            <Timeline
              className="pt-1"
              items={events.map((e) => ({
                key: e.id,
                time: formatDate(e.occurredAt, locale, tz, { day: "numeric", month: "short", year: undefined }),
                color: e.eventType === "HEARING" || e.eventType === "HEARING_REPORT" ? "var(--ev-hearing)" : e.eventType === "JUDGMENT" ? "var(--danger)" : undefined,
                title: e.title,
                meta: (
                  <>
                    <span>{t(`workspace.eventTypes.${e.eventType}`)}</span>
                    {e.status === "PROPOSED" && <Badge tone="warning">{t("workspace.proposed")}</Badge>}
                  </>
                ),
                body: e.description ? <span className="bidi-plain line-clamp-2">{e.description}</span> : undefined,
                highlight: e.eventType === "JUDGMENT" || e.eventType === "HEARING_REPORT",
              }))}
            />
          ) : (
            <EmptyState compact title={t("workspace.timelineEmpty")} />
          )}
        </Panel>

        {caps.has("tasks.view") && (
          <Panel plain title={t("ws.openTasks")} count={tasks.length || null} actions={<SectionLink href={`${base}/tasks`}>{t("common.viewAll")}</SectionLink>}>
            {tasks.length ? (
              <ul>
                {tasks.map((task) => {
                  const overdue = !!task.dueAt && task.dueAt < now;
                  return (
                    <li key={task.id}>
                      <Link href={`${base}/tasks?task=${task.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted">
                        <Circle className={cn("size-4 shrink-0", task.priority === "CRITICAL" ? "text-critical" : task.priority === "HIGH" ? "text-high" : "text-line-strong")} aria-hidden />
                        <span className="bidi-plain min-w-0 flex-1 truncate text-body text-ink">{task.title}</span>
                        {task.assignee && <Avatar name={L(task.assignee.name, task.assignee.nameAr)} src={task.assignee.photoUrl} size={20} />}
                        {task.dueAt && <span className={cn("w-20 shrink-0 text-end text-meta tabular", overdue ? "font-medium text-danger" : "text-ink-muted")}>{overdue ? t("common.overdue") : formatDate(task.dueAt, locale, tz, { day: "numeric", month: "short", year: undefined })}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact title={t("ws.noTasks")} />
            )}
          </Panel>
        )}

        <Panel
          plain
          title={t("workspace.checklist")}
          actions={checklist.length > 0 && <span className="text-meta tabular text-ink-muted">{t("ws.progress", { done, total: checklist.length })}</span>}
        >
          {checklist.length > 0 && (
            <div className="mb-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(done / checklist.length) * 100}%` }} />
            </div>
          )}
          <ChecklistPanel
            key={checklist.map((c) => `${c.id}:${c.doneAt ? 1 : 0}`).join()}
            matterId={id}
            canEdit={caps.has("matters.edit")}
            items={checklist.map((c) => ({ id: c.id, title: L(c.title, c.titleAr), required: c.required, done: !!c.doneAt }))}
          />
        </Panel>
      </div>

      {/* ── Side column ─────────────────────────────────────── */}
      <aside className="flex min-w-0 flex-col gap-8">
        <Panel plain title={t("ws.nextEvents")}>
          {m.nextHearing || m.nextDeadline ? (
            <ul className="space-y-1">
              {m.nextHearing && (
                <li>
                  <Link href={`${base}/hearings?h=${m.nextHearing.id}`} className="flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted">
                    <Gavel className="mt-0.5 size-4 shrink-0 text-ev-hearing" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium text-ink">{t("workspace.nextHearing")}</span>
                      <span className="block text-meta tabular text-ink-muted">{formatDate(m.nextHearing.startsAt, locale, tz, { weekday: "short", day: "numeric", month: "short", year: undefined })} · {formatTime(m.nextHearing.startsAt, locale, tz)}</span>
                    </span>
                    <CountdownInline target={m.nextHearing.startsAt.toISOString()} className="mt-0.5" />
                  </Link>
                </li>
              )}
              {m.nextDeadline && (
                <li>
                  <Link href={`${base}/deadlines`} className="flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-ev-court-deadline" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="bidi-plain block truncate text-body font-medium text-ink">{m.nextDeadline.title}</span>
                      <span className="flex items-center gap-1.5 text-meta tabular text-ink-muted">
                        {formatDate(m.nextDeadline.dueAt, locale, tz, { day: "numeric", month: "short", year: undefined })}
                        {m.nextDeadline.verification === "NEEDS_VERIFICATION" && <Badge tone="warning">{t("enums.verification.NEEDS_VERIFICATION")}</Badge>}
                      </span>
                    </span>
                    <CountdownInline target={m.nextDeadline.dueAt.toISOString()} className="mt-0.5" />
                  </Link>
                </li>
              )}
            </ul>
          ) : (
            <EmptyState compact title={t("ws.noEvents")} />
          )}
        </Panel>

        <Panel plain title={t("ws.keyDetails")}>
          <DetailList
            items={[
              { key: "client", label: t("workspace.client"), value: <Link href={`/app/clients/${m.client.id}`} className="hover:underline">{L(m.client.nameEn, m.client.nameAr)}</Link> },
              { key: "opp", label: t("workspace.opponent"), value: opponents.length ? opponents.map((o) => L(o.contact.nameEn, o.contact.nameAr)).join("، ") : "—" },
              { key: "court", label: t("workspace.court"), value: m.court ? L(m.court.name, m.court.nameAr) : "—" },
              { key: "no", label: t("workspace.officialNumber"), value: m.officialCaseNumber ? <span className="record-id">{m.officialCaseNumber}</span> : "—" },
              { key: "type", label: t("workspace.caseType"), value: m.caseType ? L(m.caseType.name, m.caseType.nameAr) : t(`enums.matterKind.${m.kind}`) },
              { key: "stage", label: t("workspace.stage"), value: m.stage ? L(m.stage.name, m.stage.nameAr) : "—" },
              ...(caps.has("finance.view") && m.claimAmount != null ? [{ key: "claim", label: t("workspace.claimValue"), value: <span className="ltr-nums">{formatMoney(m.claimAmount, locale, m.currency)}</span> }] : []),
              { key: "fee", label: t("workspace.feeArrangement"), value: t(`enums.billingType.${m.billingType}`) },
              { key: "opened", label: t("workspace.opened"), value: formatDate(m.openedAt, locale, tz) },
              { key: "owner", label: t("common.owner"), value: L(m.owner.name, m.owner.nameAr) },
              { key: "conflict", label: t("intake.steps.conflict"), value: t(`enums.conflictStatus.${m.conflictStatus}`) },
              { key: "updated", label: t("workspace.lastUpdate"), value: relativeTime(m.lastActivityAt, locale) },
            ]}
          />
        </Panel>

        <Panel plain title={t("workspace.team")} count={m.members.length} actions={<SectionLink href={`${base}/team`}>{t("common.viewAll")}</SectionLink>}>
          <ul>
            {m.members.slice(0, 6).map((mm) => (
              <li key={mm.id} className="flex items-center gap-2.5 px-3 py-1.5">
                <Avatar name={L(mm.user.name, mm.user.nameAr)} src={mm.user.photoUrl} size={22} />
                <span className="min-w-0 flex-1 truncate text-body text-ink">{L(mm.user.name, mm.user.nameAr)}</span>
                <span className="text-meta text-ink-subtle">{t(`enums.memberRole.${mm.role}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel plain title={t("workspace.parties")}>
          <PartiesPanel
            matterId={id}
            canEdit={caps.has("matters.edit")}
            client={{ id: m.client.id, name: L(m.client.nameEn, m.client.nameAr) }}
            parties={m.parties.map((p) => ({ id: p.id, role: p.role, name: L(p.contact.nameEn, p.contact.nameAr), contactId: p.contact.id, type: p.contact.type }))}
          />
        </Panel>

        {caps.has("documents.view") && (
          <Panel plain title={t("ws.importantDocuments")} actions={<SectionLink href={`${base}/documents`}>{t("common.viewAll")}</SectionLink>}>
            {docs.length ? (
              <ul>
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/app/documents/${d.id}`} className="flex items-center gap-2.5 rounded-md px-3 py-1.5 transition-colors hover:bg-surface-muted">
                      <FileText className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <span className="bidi-plain min-w-0 flex-1 truncate text-body text-ink">{d.title}</span>
                      <StatusText tone={DOC_STATUS_TONE[d.status]} className="text-meta">{t(`enums.documentStatus.${d.status}`)}</StatusText>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title={t("ws.noDocuments")} />
            )}
          </Panel>
        )}

        <Panel plain title={t("ws.health")} footer={<p className="px-3 text-caption text-ink-subtle">{t("workspace.healthNote")}</p>}>
          {stringList(m.riskFlags).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pt-1">
              <Flag className="size-3.5 text-warning" aria-hidden />
              {stringList(m.riskFlags).map((f) => <Badge key={f} tone="warning">{t(`enums.riskFlag.${f}`)}</Badge>)}
            </div>
          )}
          <dl>
            {health.map((h) => (
              <div key={h.key} className="flex items-center justify-between gap-3 px-3 py-1.5 text-body">
                <dt className="text-ink-muted">{t(`workspace.indicators.${h.key}`)}</dt>
                <dd className={cn("font-medium tabular", h.tone === "danger" && h.value > 0 ? "text-danger" : h.tone === "warning" && h.value > 0 ? "text-warning" : "text-ink")}>{h.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="flex items-start gap-2 text-body">
          <Globe className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
          <div className="min-w-0">
            <span className="text-ink-muted">{t("workspace.portalEnabled")}: </span>
            <span className="font-medium text-ink">{m.portalEnabled ? t("common.yes") : t("common.no")}</span>
            {m.portalEnabled && m.portalStatusText && <p className="bidi-plain mt-1 text-meta text-ink-muted">“{m.portalStatusText}”</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}

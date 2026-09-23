import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Users, History, Gavel, ListChecks, MessageSquare, FolderOpen, ShieldCheck, ChevronLeft, ChevronRight, StickyNote } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { matterAccess } from "@/server/services/access";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Badge, DOC_STATUS_TONE, HEARING_STATUS_TONE } from "@/components/ui/badge";
import { CountdownBlocks } from "@/components/countdown";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";
import { PrepEditor } from "./editor";

export const metadata = { title: "Hearing preparation" };

export default async function PreparePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const h = await db.hearing.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null }, include: { court: true, attendingLawyer: { select: { name: true, nameAr: true } } } });
  if (!h) notFound();
  const acc = await matterAccess(ctx, h.matterId);
  if (!acc.has("hearings.view")) notFound();
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;

  const [m, previous, lastDecision, docs, tasks, teamNotes, clientNotes] = await Promise.all([
    db.matter.findUniqueOrThrow({ where: { id: h.matterId }, include: { client: true, parties: { include: { contact: true } } } }),
    h.previousHearingId ? db.hearing.findUnique({ where: { id: h.previousHearingId } }) : db.hearing.findFirst({ where: { matterId: h.matterId, startsAt: { lt: h.startsAt }, deletedAt: null }, orderBy: { startsAt: "desc" } }),
    db.hearing.findFirst({ where: { matterId: h.matterId, decisions: { not: null }, deletedAt: null }, orderBy: { startsAt: "desc" } }),
    acc.has("documents.view") ? db.document.findMany({ where: { matterId: h.matterId, deletedAt: null, category: { in: ["COURT", "EVIDENCE", "CONTRACT", "LEGAL_MEMO", "JUDGMENT", "EXPERT_REPORT", "SUBMISSION"] } }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, category: true, status: true } }) : [],
    db.task.findMany({ where: { matterId: h.matterId, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }, orderBy: { dueAt: "asc" }, take: 15, include: { assignee: { select: { name: true, nameAr: true } } } }),
    acc.has("notes.view") ? db.note.findMany({ where: { matterId: h.matterId, deletedAt: null, visibility: "TEAM" }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 6 }) : [],
    acc.has("notes.view") ? db.note.findMany({ where: { matterId: h.matterId, deletedAt: null, visibility: "CLIENT" }, orderBy: { createdAt: "desc" }, take: 4 }) : [],
  ]);
  const Back = locale === "ar" ? ChevronRight : ChevronLeft;
  const evidence = docs.filter((d) => d.category === "EVIDENCE");
  const important = docs.filter((d) => d.category !== "EVIDENCE");

  const docList = (list: typeof docs) =>
    list.length ? (
      <ul className="divide-y divide-line">
        {list.map((d) => (
          <li key={d.id}><Link href={`/app/documents/${d.id}`} className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-surface-muted/60"><FileText className="size-4 text-ink-subtle" /><span className="flex-1 truncate">{d.title}</span><Badge tone={DOC_STATUS_TONE[d.status]}>{t(`enums.documentStatus.${d.status}`)}</Badge></Link></li>
        ))}
      </ul>
    ) : <EmptyState compact title="—" />;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/app/cases/${m.id}/hearings?h=${h.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-ink-subtle hover:text-ink"><Back className="size-3.5" /> {m.internalNumber}</Link>
      <header className="mt-3 flex flex-col gap-4 rounded-lg bg-nav p-5 text-nav-fg lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-nav-muted"><Gavel className="size-4" /> {t("hearings.prepTitle")}</p>
          <h1 className="mt-1 text-xl font-semibold text-white">{L(m.title, m.titleAr)}</h1>
          <p className="mt-1 text-[13px] text-nav-muted">
            {h.sessionType} · {formatDateTime(h.startsAt, locale, tz)} · {h.court ? L(h.court.name, h.court.nameAr) : ""} {h.courtRoom && `· ${h.courtRoom}`}
            {h.attendingLawyer && ` · ${L(h.attendingLawyer.name, h.attendingLawyer.nameAr)}`}
          </p>
          <Badge tone={HEARING_STATUS_TONE[h.status]} className="mt-2">{t(`enums.hearingStatus.${h.status}`)}</Badge>
        </div>
        <CountdownBlocks target={h.startsAt.toISOString()} dark />
      </header>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <Panel title={t("hearings.prepCaseSummary")} icon={<FileText />}>
            <div className="space-y-3 p-4 text-[13.5px] leading-relaxed">
              <p className="whitespace-pre-line text-ink">{m.summary || "—"}</p>
              {m.currentStatusText && <p className="rounded-md bg-surface-muted p-2.5 text-[13px] text-ink-muted"><span className="font-medium text-ink">{t("workspace.currentStatus")}:</span> {m.currentStatusText}</p>}
              {h.requiredDocuments && <p className="rounded-md border border-warning/30 bg-warning-soft p-2.5 text-[13px] text-warning"><span className="font-medium">{t("hearings.requiredDocuments")}:</span> {h.requiredDocuments}</p>}
            </div>
          </Panel>
          <PrepEditor
            hearingId={h.id}
            canEdit={acc.has("hearings.manage")}
            canAi={ctx.can("ai.use") && acc.has("ai.use")}
            matterId={m.id}
            status={h.status}
            initial={{ questions: h.questions ?? "", arguments: h.arguments ?? "", preparationNotes: h.preparationNotes ?? "" }}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title={t("hearings.prepDocuments")} icon={<FolderOpen />}>{docList(important)}</Panel>
            <Panel title={t("hearings.prepEvidence")} icon={<ShieldCheck />}>{docList(evidence)}</Panel>
          </div>
        </div>
        <div className="space-y-5 xl:col-span-5">
          <Panel title={t("hearings.prepParties")} icon={<Users />}>
            <ul className="divide-y divide-line text-[13px]">
              <li className="flex items-center gap-2 px-4 py-2"><Badge tone="brand">{t("enums.partyRole.CLIENT")}</Badge> {L(m.client.nameEn, m.client.nameAr)}</li>
              {m.parties.map((p) => <li key={p.id} className="flex items-center gap-2 px-4 py-2"><Badge tone={p.role === "OPPONENT" ? "danger" : "neutral"}>{t(`enums.partyRole.${p.role}`)}</Badge> {L(p.contact.nameEn, p.contact.nameAr)}</li>)}
            </ul>
          </Panel>
          <Panel title={t("hearings.prepPrevNotes")} icon={<History />}>
            {previous ? (
              <div className="space-y-2 p-4 text-[13px]">
                <p className="text-[12px] text-ink-subtle">{formatDate(previous.startsAt, locale, tz)} · {formatTime(previous.startsAt, locale, tz)} · {previous.sessionType}</p>
                {previous.outcome && <p className="whitespace-pre-line text-ink">{previous.outcome}</p>}
                {previous.requiredActions && <p className="whitespace-pre-line text-ink-muted"><span className="font-medium text-ink">{t("hearings.requiredActions")}:</span> {previous.requiredActions}</p>}
              </div>
            ) : <EmptyState compact title="—" />}
          </Panel>
          <Panel title={t("hearings.prepLatestDecision")} icon={<Gavel />}>
            {lastDecision ? <p className="whitespace-pre-line p-4 text-[13px] text-ink">{lastDecision.decisions} <span className="block pt-1 text-[12px] text-ink-subtle">{formatDate(lastDecision.startsAt, locale, tz)}</span></p> : <EmptyState compact title="—" />}
          </Panel>
          <Panel title={t("hearings.prepPendingTasks")} icon={<ListChecks />}>
            {tasks.length ? (
              <ul className="divide-y divide-line">
                {tasks.map((tk) => <li key={tk.id} className="px-4 py-2 text-[13px]"><Link href={`/app/tasks?task=${tk.id}`} className="hover:underline">{tk.title}</Link><span className="block text-[12px] text-ink-subtle">{tk.assignee ? L(tk.assignee.name, tk.assignee.nameAr) : "—"}{tk.dueAt && ` · ${formatDate(tk.dueAt, locale, tz)}`}</span></li>)}
              </ul>
            ) : <EmptyState compact title={t("dashboard.tasksEmpty")} />}
          </Panel>
          <Panel title={t("hearings.prepLegalNotes")} icon={<StickyNote />}>
            {teamNotes.length ? <ul className="divide-y divide-line">{teamNotes.map((n) => <li key={n.id} className="whitespace-pre-line px-4 py-2.5 text-[13px] text-ink">{n.body}</li>)}</ul> : <EmptyState compact title="—" />}
          </Panel>
          <Panel title={t("hearings.prepClientNotes")} icon={<MessageSquare />}>
            {clientNotes.length ? <ul className="divide-y divide-line">{clientNotes.map((n) => <li key={n.id} className="whitespace-pre-line px-4 py-2.5 text-[13px] text-ink">{n.body}</li>)}</ul> : <EmptyState compact title="—" />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

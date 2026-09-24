import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Gavel, X, Building2, User, MapPin } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { matterAccess } from "@/server/services/access";
import { documentScope } from "@/server/services/documents";
import { EmptyState, Avatar } from "@/components/ui/layout";
import { Badge, StatusText, DOC_STATUS_TONE, HEARING_STATUS_TONE } from "@/components/ui/badge";
import { CountdownInline } from "@/components/countdown";
import { formatDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PrepEditor } from "./editor";

export const metadata = { title: "Hearing preparation" };

/** Hearing preparation — focus mode: one reading column, a quiet index, nothing else. */
export default async function PreparePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const h = await db.hearing.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null }, include: { court: true, attendingLawyer: { select: { name: true, nameAr: true, photoUrl: true } } } });
  if (!h) notFound();
  const acc = await matterAccess(ctx, h.matterId);
  if (!acc.has("hearings.view")) notFound();
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;

  const [m, previous, lastDecision, docs, tasks, teamNotes, clientNotes] = await Promise.all([
    db.matter.findUniqueOrThrow({ where: { id: h.matterId }, include: { client: true, parties: { include: { contact: true } } } }),
    h.previousHearingId ? db.hearing.findUnique({ where: { id: h.previousHearingId } }) : db.hearing.findFirst({ where: { matterId: h.matterId, startsAt: { lt: h.startsAt }, deletedAt: null }, orderBy: { startsAt: "desc" } }),
    db.hearing.findFirst({ where: { matterId: h.matterId, decisions: { not: null }, deletedAt: null }, orderBy: { startsAt: "desc" } }),
    // Document-level permissions (DENY, highly confidential) are enforced by documentScope.
    acc.has("documents.view")
      ? db.document.findMany({ where: { AND: [documentScope(ctx), { matterId: h.matterId, category: { in: ["COURT", "EVIDENCE", "CONTRACT", "LEGAL_MEMO", "JUDGMENT", "EXPERT_REPORT", "SUBMISSION"] } }] }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, category: true, status: true } })
      : [],
    acc.has("tasks.view") ? db.task.findMany({ where: { matterId: h.matterId, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } }, orderBy: { dueAt: "asc" }, take: 15, include: { assignee: { select: { name: true, nameAr: true, photoUrl: true } } } }) : [],
    acc.has("notes.view") ? db.note.findMany({ where: { matterId: h.matterId, deletedAt: null, visibility: "TEAM" }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 6 }) : [],
    acc.has("notes.view") ? db.note.findMany({ where: { matterId: h.matterId, deletedAt: null, visibility: "CLIENT" }, orderBy: { createdAt: "desc" }, take: 4 }) : [],
  ]);
  const evidence = docs.filter((d) => d.category === "EVIDENCE");
  const important = docs.filter((d) => d.category !== "EVIDENCE");
  const now = new Date();

  const sections = [
    { id: "brief", label: t("focus.brief") },
    { id: "decisions", label: t("focus.decisions") },
    { id: "prep", label: t("focus.work") },
    ...(acc.has("documents.view") ? [{ id: "documents", label: t("focus.documents") }] : []),
    { id: "tasks", label: t("focus.tasks") },
    ...(acc.has("notes.view") ? [{ id: "notes", label: t("focus.notes") }] : []),
  ];

  const docRows = (list: typeof docs) =>
    list.length ? (
      <ul>
        {list.map((d) => (
          <li key={d.id}>
            <Link href={`/app/documents/${d.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted">
              <FileText className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              <span className="bidi-plain min-w-0 flex-1 truncate text-body text-ink">{d.title}</span>
              <span className="hidden text-meta text-ink-subtle sm:inline">{t(`enums.documentCategory.${d.category}`)}</span>
              <StatusText tone={DOC_STATUS_TONE[d.status]} className="text-meta">{t(`enums.documentStatus.${d.status}`)}</StatusText>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <p className="px-2 py-2 text-body text-ink-subtle">—</p>
    );

  const h2 = (id: string, children: React.ReactNode) => (
    <h2 id={`${id}-h`} className="border-b border-line pb-2 text-heading font-semibold text-ink">{children}</h2>
  );

  return (
    <div className="min-h-full">
      {/* Focus header */}
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-meta text-ink-subtle">
              <Gavel className="size-3.5 text-ev-hearing" aria-hidden />
              {t("hearings.prepTitle")}
              <span className="record-id">· {m.internalNumber}</span>
              <Badge tone={HEARING_STATUS_TONE[h.status]}>{t(`enums.hearingStatus.${h.status}`)}</Badge>
            </p>
            <h1 className="bidi-plain mt-1 text-title font-semibold leading-snug text-ink">{L(m.title, m.titleAr)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-muted">
              <span className="tabular">{formatDate(h.startsAt, locale, tz, { weekday: "long", day: "numeric", month: "long", year: undefined })} · {formatTime(h.startsAt, locale, tz)}</span>
              {h.court && <span className="inline-flex items-center gap-1"><Building2 className="size-3.5 text-ink-subtle" aria-hidden />{L(h.court.name, h.court.nameAr)}{h.courtRoom && ` · ${h.courtRoom}`}</span>}
              {h.isRemote && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-ink-subtle" aria-hidden />{t("hearingWidget.remote")}</span>}
              {h.attendingLawyer && <span className="inline-flex items-center gap-1.5"><Avatar name={L(h.attendingLawyer.name, h.attendingLawyer.nameAr)} src={h.attendingLawyer.photoUrl} size={16} />{L(h.attendingLawyer.name, h.attendingLawyer.nameAr)}</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-end">
              <div className="text-meta text-ink-subtle">{t("home.remaining")}</div>
              <CountdownInline target={h.startsAt.toISOString()} className="text-[18px] font-semibold" />
            </div>
            <Link href={`/app/cases/${m.id}/hearings?h=${h.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-body text-ink-muted transition-colors hover:text-ink">
              <X className="size-3.5" /> {t("focus.exit")}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:px-8">
        {/* Reading / working column */}
        <div className="min-w-0 max-w-[760px] space-y-10">
          <section id="brief" aria-labelledby="brief-h" className="scroll-mt-28">
            {h2("brief", t("focus.brief"))}
            <p className="bidi-plain mt-3 whitespace-pre-line text-ui leading-relaxed text-ink">{m.summary || "—"}</p>
            {m.currentStatusText && (
              <p className="mt-3 text-body text-ink-muted">
                <span className="text-ink-subtle">{t("workspace.currentStatus")}: </span>
                <span className="bidi-plain">{m.currentStatusText}</span>
              </p>
            )}
            {h.requiredDocuments && (
              <div className="mt-4 border-s-2 border-warning bg-warning-soft/60 px-3 py-2 text-body">
                <div className="text-meta font-medium text-warning">{t("focus.requiredDocs")}</div>
                <p className="bidi-plain mt-0.5 text-ink">{h.requiredDocuments}</p>
              </div>
            )}
          </section>

          <section id="decisions" aria-labelledby="decisions-h" className="scroll-mt-28">
            {h2("decisions", t("focus.decisions"))}
            <dl className="mt-1 divide-y divide-line/70">
              <div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className="text-meta text-ink-subtle">{t("focus.previousHearing")}</dt>
                <dd className="text-body">
                  {previous ? (
                    <>
                      <span className="text-meta tabular text-ink-subtle">{formatDate(previous.startsAt, locale, tz)}{previous.sessionType && ` · ${previous.sessionType}`}</span>
                      {previous.outcome && <p className="bidi-plain mt-1 whitespace-pre-line text-ink">{previous.outcome}</p>}
                      {previous.requiredActions && <p className="bidi-plain mt-1 whitespace-pre-line text-ink-muted"><span className="text-ink-subtle">{t("hearings.requiredActions")}: </span>{previous.requiredActions}</p>}
                    </>
                  ) : <span className="text-ink-subtle">—</span>}
                </dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className="text-meta text-ink-subtle">{t("focus.latestDecision")}</dt>
                <dd className="text-body">
                  {lastDecision ? (
                    <>
                      <span className="text-meta tabular text-ink-subtle">{formatDate(lastDecision.startsAt, locale, tz)}</span>
                      <p className="bidi-plain mt-1 whitespace-pre-line text-ink">{lastDecision.decisions}</p>
                    </>
                  ) : <span className="text-ink-subtle">—</span>}
                </dd>
              </div>
            </dl>
          </section>

          <PrepEditor
            hearingId={h.id}
            canEdit={acc.has("hearings.manage")}
            canAi={ctx.can("ai.use") && acc.has("ai.use")}
            matterId={m.id}
            status={h.status}
            initial={{ questions: h.questions ?? "", arguments: h.arguments ?? "", preparationNotes: h.preparationNotes ?? "" }}
          />

          {acc.has("documents.view") && (
            <section id="documents" aria-labelledby="documents-h" className="scroll-mt-28">
              {h2("documents", t("focus.documents"))}
              <div className="mt-2">{docRows(important)}</div>
              {evidence.length > 0 && (
                <>
                  <h3 className="mt-4 px-2 text-meta font-medium text-ink-subtle">{t("focus.evidence")}</h3>
                  <div className="mt-1">{docRows(evidence)}</div>
                </>
              )}
            </section>
          )}

          <section id="tasks" aria-labelledby="tasks-h" className="scroll-mt-28">
            {h2("tasks", t("focus.tasks"))}
            {tasks.length ? (
              <ul className="mt-2">
                {tasks.map((tk) => {
                  const overdue = !!tk.dueAt && tk.dueAt < now;
                  return (
                    <li key={tk.id}>
                      <Link href={`/app/tasks?task=${tk.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted">
                        <span aria-hidden className="size-3.5 shrink-0 rounded-full border-[1.5px] border-line-strong" />
                        <span className="bidi-plain min-w-0 flex-1 truncate text-body text-ink">{tk.title}</span>
                        {tk.assignee && <Avatar name={L(tk.assignee.name, tk.assignee.nameAr)} src={tk.assignee.photoUrl} size={18} />}
                        {tk.dueAt && <span className={cn("w-20 shrink-0 text-end text-meta tabular", overdue ? "font-medium text-danger" : "text-ink-muted")}>{overdue ? t("common.overdue") : formatDate(tk.dueAt, locale, tz, { day: "numeric", month: "short", year: undefined })}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact title={t("dashboard.tasksEmpty")} />
            )}
          </section>

          {acc.has("notes.view") && (
            <section id="notes" aria-labelledby="notes-h" className="scroll-mt-28">
              {h2("notes", t("focus.notes"))}
              <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
                {[
                  { title: t("hearings.prepLegalNotes"), list: teamNotes },
                  { title: t("hearings.prepClientNotes"), list: clientNotes },
                ].map((g) => (
                  <div key={g.title}>
                    <h3 className="text-meta font-medium text-ink-subtle">{g.title}</h3>
                    {g.list.length ? (
                      <ul className="mt-1 space-y-2">
                        {g.list.map((n) => <li key={n.id} className="bidi-plain whitespace-pre-line border-s-2 border-line ps-3 text-body text-ink">{n.body}</li>)}
                      </ul>
                    ) : <p className="mt-1 text-body text-ink-subtle">—</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Quiet index + parties */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-6">
            <nav aria-label={t("focus.onThisPage")}>
              <div className="eyebrow">{t("focus.onThisPage")}</div>
              <ul className="mt-2 space-y-0.5 border-s border-line">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ms-px block border-s border-transparent py-1 ps-3 text-body text-ink-muted transition-colors hover:border-ink hover:text-ink">{s.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
            <div>
              <div className="eyebrow">{t("hearings.prepParties")}</div>
              <ul className="mt-2 space-y-1.5 text-body">
                <li className="flex items-center gap-2"><Building2 className="size-3.5 shrink-0 text-ink-subtle" aria-hidden /><span className="min-w-0 flex-1 truncate text-ink">{L(m.client.nameEn, m.client.nameAr)}</span><span className="text-meta text-accent">{t("enums.partyRole.CLIENT")}</span></li>
                {m.parties.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    {p.contact.type === "COMPANY" ? <Building2 className="size-3.5 shrink-0 text-ink-subtle" aria-hidden /> : <User className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />}
                    <span className="bidi-plain min-w-0 flex-1 truncate text-ink">{L(p.contact.nameEn, p.contact.nameAr)}</span>
                    <span className={cn("text-meta", p.role === "OPPONENT" ? "text-danger" : "text-ink-subtle")}>{t(`enums.partyRole.${p.role}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, Copy, Check, X, Quote, CalendarPlus, ListPlus, AlertTriangle, Bot } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { useAction } from "@/components/forms";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { runAiAction, applyAiAction, reviewAiAction } from "./actions";

const TASKS = ["CASE_BRIEF", "HEARING_BRIEF", "DOCUMENT_SUMMARY", "COMPARE", "EXTRACT", "TIMELINE_DRAFT", "SUGGEST_TASKS", "DRAFT_MEMO", "DRAFT_CLIENT_UPDATE", "DRAFT_EMAIL", "TRANSLATE", "ASK"] as const;
type Job = { id: string; kind: string; status: string; reviewStatus: string; output: string | null; structured: Record<string, unknown[]> | null; citations: { document: string; documentId: string | null; page: number | null; quote: string }[]; error: string | null; createdAt: string; matter: string | null; tokens: number };

export function AiWorkbench({ available, allowDocuments, matter, documents, preset, jobs }: {
  available: boolean; allowDocuments: boolean; matter: { id: string; label: string } | null;
  documents: { id: string; title: string; pages: number | null; textStatus: string }[]; preset: { task: string | null; document: string | null; hearing: string | null }; jobs: Job[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [task, setTask] = useState<(typeof TASKS)[number]>((TASKS as readonly string[]).includes(preset.task ?? "") ? (preset.task as never) : "CASE_BRIEF");
  const [docs, setDocs] = useState<string[]>(preset.document ? [preset.document] : []);
  const [instructions, setInstructions] = useState("");
  const [lang, setLang] = useState<"ar" | "en">(locale);
  const [openId, setOpenId] = useState<string | null>(jobs[0]?.id ?? null);
  const job = jobs.find((j) => j.id === openId) ?? null;

  const submit = () =>
    run(() => runAiAction({ task, matterId: matter!.id, documentIds: docs, hearingId: preset.hearing, instructions: instructions || null, targetLanguage: lang }), {
      onSuccess: (d) => { setOpenId((d as { id: string }).id); router.refresh(); },
    });

  const sources = job && job.citations.length > 0 ? (
    <ol className="space-y-2">
      {job.citations.map((c, i) => (
        <li key={i} className="text-body">
          <div className="flex items-start gap-2">
            <span className="mt-px shrink-0 rounded-sm bg-surface-sunken px-1 text-caption font-medium tabular text-ink-muted">{i + 1}</span>
            <span className="min-w-0">
              {c.documentId ? <Link href={`/app/documents/${c.documentId}`} className="bidi-plain font-medium text-ink hover:underline">{c.document}</Link> : <span className="bidi-plain font-medium text-ink">{c.document}</span>}
              {c.page ? <span className="text-meta text-ink-subtle"> · p.{c.page}</span> : null}
              <span className="bidi-plain mt-0.5 line-clamp-3 block text-meta text-ink-muted">“{c.quote}”</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-meta text-ink-subtle">—</p>
  );

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
      {/* Left: case · tools · history */}
      <aside className="space-y-6">
        <Field label={t("ai.matter")} required>
          {(a) => <Picker {...a} type="matters" value={matter?.id ?? null} initialLabel={matter?.label} onChange={(i) => router.push(i ? `/app/ai?matter=${i.id}&task=${task}` : "/app/ai")} placeholder={t("quickForms.selectCase")} />}
        </Field>
        <div>
          <div className="eyebrow">{t("common.type")}</div>
          <ul role="radiogroup" className="mt-1.5 space-y-0.5">
            {TASKS.map((k) => (
              <li key={k}>
                <button type="button" role="radio" aria-checked={task === k} onClick={() => setTask(k as never)} className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-start text-body transition-colors", task === k ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
                  <Sparkles className={cn("size-3.5 shrink-0", task === k ? "text-accent" : "text-ink-subtle")} />
                  <span className="truncate">{t(`ai.tasks.${k}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="eyebrow">{t("ai.history")}</div>
          {jobs.length === 0 ? <p className="mt-1.5 px-2.5 text-meta text-ink-subtle">{t("ai.empty")}</p> : (
            <ul className="mt-1.5 space-y-0.5">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => setOpenId(j.id)} className={cn("flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-start transition-colors", openId === j.id ? "bg-surface-sunken" : "hover:bg-surface-muted")}>
                    <span className="w-full truncate text-body text-ink">{t(`ai.tasks.${j.kind}`)}</span>
                    <span className="flex w-full items-center gap-1.5 text-meta text-ink-subtle">
                      {j.matter && <span className="record-id">{j.matter}</span>}
                      <span>· {relativeTime(j.createdAt, locale)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Centre: composer + output */}
      <section className="min-w-0 space-y-4">
        <div className="rounded-lg border border-line focus-within:border-accent">
          <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t("ai.instructionsPlaceholder")} aria-label={t("ai.instructions")} className="bidi-plain block w-full resize-y rounded-t-lg bg-transparent px-3 py-2.5 text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none sm:text-body" />
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-2.5 py-2">
            <span className="min-w-0 truncate text-meta text-ink-subtle">{t(`ai.tasks.${task}`)}{matter && <> · <span className="record-id">{matter.label.split(" · ")[0]}</span></>}</span>
            <div className="ms-auto flex items-center gap-2">
              <Select value={lang} onChange={(e) => setLang(e.target.value as never)} aria-label={t("ai.targetLanguage")} className="sm:h-7 sm:w-28">
                <option value="ar">{t("clients.langAr")}</option><option value="en">{t("clients.langEn")}</option>
              </Select>
              <Button variant="primary" size="sm" loading={pending} disabled={!available || !matter} onClick={submit}><Sparkles /> {pending ? t("ai.running") : t("ai.run")}</Button>
            </div>
          </div>
        </div>
        {task === "EXTRACT" && <p className="border-s-2 border-warning bg-warning-soft/60 px-3 py-2 text-meta text-warning">{t("ai.deadlineWarning")}</p>}
        {job ? <JobResult key={job.id} job={job} /> : <div className="rounded-lg border border-dashed border-line-strong"><EmptyState icon={<Sparkles />} title={t("ai.result")} /></div>}
      </section>

      {/* Right: sources · case context */}
      <aside className="space-y-6">
        <div>
          <div className="eyebrow">{t("ai.sources")}</div>
          <div className="mt-2">{sources}</div>
        </div>
        {matter && (
          <div>
            <div className="eyebrow">{t("ai.documents")}</div>
            <p className="mt-1 text-meta text-ink-subtle">{allowDocuments ? t("ai.documentsHint") : t("settings.ai.documentsHint")}</p>
            <div className="mt-2 max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin">
              {documents.length === 0 && <p className="py-2 text-meta text-ink-subtle">{t("documents.empty")}</p>}
              {documents.map((d) => (
                <label key={d.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body hover:bg-surface-muted", !allowDocuments && "opacity-50")}>
                  <input type="checkbox" disabled={!allowDocuments || d.textStatus !== "DONE"} checked={docs.includes(d.id)} onChange={(e) => setDocs(e.target.checked ? [...docs, d.id] : docs.filter((x) => x !== d.id))} className="accent-[var(--brand)]" />
                  <FileText className="size-3.5 shrink-0 text-ink-subtle" />
                  <span className="bidi-plain min-w-0 flex-1 truncate">{d.title}</span>
                  {d.textStatus !== "DONE" ? <Badge tone="warning">{t(`enums.processingStatus.${d.textStatus}`)}</Badge> : d.pages && <span className="text-meta text-ink-subtle">{d.pages}p</span>}
                </label>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function JobResult({ job }: { job: Job }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [sel, setSel] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const s = job.structured;
  const toggle = (i: number) => setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]);
  const apply = (kind: "timeline" | "tasks" | "deadlines") => run(() => applyAiAction({ jobId: job.id, kind, indexes: sel }), {
    onSuccess: (d) => { const n = (d as { count: number }).count; toast.success(kind === "timeline" ? t("ai.proposalsCreated", { n }) : kind === "tasks" ? t("ai.tasksCreated", { n }) : t("courtImport.applied")); setSel([]); router.refresh(); },
  });
  const Row = ({ i, children, src }: { i: number; children: React.ReactNode; src?: { document: string; page: number | null } }) => (
    <label className="flex cursor-pointer items-start gap-2.5 px-4 py-2.5 text-body hover:bg-surface-muted/50">
      <input type="checkbox" checked={sel.includes(i)} onChange={() => toggle(i)} className="mt-0.5 accent-[var(--accent)]" />
      <div className="min-w-0 flex-1">{children}{src && <p className="text-meta text-ink-subtle"><Quote className="me-1 inline size-3" />{src.document}{src.page ? ` — p. ${src.page}` : ""}</p>}</div>
    </label>
  );

  return (
    <Panel
      title={t(`ai.tasks.${job.kind}`)}
      icon={<Sparkles />}
      actions={job.status === "SUCCEEDED" && (
        <div className="flex gap-1">
          {job.output && <Button size="xs" variant="ghost" onClick={() => { navigator.clipboard.writeText(job.output ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />} {t("ai.copy")}</Button>}
          {job.reviewStatus === "REVIEW_REQUIRED" && <Button size="xs" variant="secondary" onClick={() => run(() => reviewAiAction({ jobId: job.id, status: "ACCEPTED" }), { onSuccess: () => router.refresh() })}><Check /> {t("ai.accept")}</Button>}
          {job.reviewStatus !== "DISCARDED" && <Button size="xs" variant="ghost" onClick={() => run(() => reviewAiAction({ jobId: job.id, status: "DISCARDED" }), { onSuccess: () => router.refresh() })}><X /> {t("ai.discard")}</Button>}
        </div>
      )}
    >
      <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-meta font-medium text-warning"><AlertTriangle className="me-1 inline size-3.5" /> {t("ai.reviewRequired")}</div>
      {job.status === "FAILED" ? (
        <EmptyState compact title={t(`errors.${job.error ?? "unexpected"}`)} />
      ) : s ? (
        <div>
          {Array.isArray(s.events) && (
            <>
              <ul className="divide-y divide-line">{(s.events as { date: string; title: string; description: string; document: string; page: number | null }[]).map((e, i) => <li key={i}><Row i={i} src={e}><p className="font-medium text-ink"><span className="ltr-nums me-2 tabular text-ink-muted">{e.date}</span>{e.title}</p><p className="text-ink-muted">{e.description}</p></Row></li>)}</ul>
              <div className="border-t border-line p-3"><Button size="sm" variant="primary" disabled={!sel.length} loading={pending} onClick={() => apply("timeline")}><CalendarPlus /> {t("ai.toTimeline")}</Button></div>
            </>
          )}
          {Array.isArray(s.tasks) && (
            <>
              <ul className="divide-y divide-line">{(s.tasks as { title: string; reason: string; priority: string }[]).map((x, i) => <li key={i}><Row i={i}><p className="font-medium text-ink">{x.title} <Badge tone="neutral">{t(`enums.priority.${x.priority}`)}</Badge></p><p className="text-ink-muted">{x.reason}</p></Row></li>)}</ul>
              <div className="border-t border-line p-3"><Button size="sm" variant="primary" disabled={!sel.length} loading={pending} onClick={() => apply("tasks")}><ListPlus /> {t("ai.toTasks")}</Button></div>
            </>
          )}
          {Array.isArray(s.deadlines) && (
            <div className="space-y-4 p-4 text-body">
              {(["parties", "dates", "amounts"] as const).map((k) => Array.isArray(s[k]) && (s[k] as unknown[]).length > 0 && (
                <div key={k}>
                  <p className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-subtle">{k}</p>
                  <ul className="space-y-1">{(s[k] as Record<string, string | number | null>[]).map((x, i) => <li key={i} className="text-ink">{Object.entries(x).filter(([kk]) => !["document", "page"].includes(kk)).map(([, v]) => v).join(" · ")} <span className="text-meta text-ink-subtle">— {x.document}{x.page ? `, p. ${x.page}` : ""}</span></li>)}</ul>
                </div>
              ))}
              <div>
                <p className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-subtle">{t("deadlines.title")}</p>
                <div className="-mx-4 divide-y divide-line">{(s.deadlines as { due: string; description: string; type: string; document: string; page: number | null }[]).map((d, i) => <Row key={i} i={i} src={d}><p className="text-ink"><span className="ltr-nums me-2 font-mono text-meta">{d.due}</span>{d.description} <Badge tone="warning">{t("enums.verification.NEEDS_VERIFICATION")}</Badge></p></Row>)}</div>
                <Button size="sm" variant="primary" className="mt-2" disabled={!sel.length} loading={pending} onClick={() => apply("deadlines")}><CalendarPlus /> {t("deadlines.new")}</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="whitespace-pre-wrap text-body leading-relaxed text-ink">{job.output}</div>
          {job.tokens > 0 && <p className="mt-3 text-end text-caption text-ink-subtle">{job.tokens.toLocaleString()} {t("ai.tokens")}</p>}
        </div>
      )}
    </Panel>
  );
}

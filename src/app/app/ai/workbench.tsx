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

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-5">
        <Panel title={t("ai.run")} icon={<Sparkles />}>
          <div className="grid gap-4 p-4">
            <Field label={t("ai.matter")} required>
              {(a) => <Picker {...a} type="matters" value={matter?.id ?? null} initialLabel={matter?.label} onChange={(i) => router.push(i ? `/app/ai?matter=${i.id}&task=${task}` : "/app/ai")} placeholder={t("quickForms.selectCase")} />}
            </Field>
            <Field label={t("common.type")}>{(a) => <Select {...a} value={task} onChange={(e) => setTask(e.target.value as never)}>{TASKS.map((k) => <option key={k} value={k}>{t(`ai.tasks.${k}`)}</option>)}</Select>}</Field>
            {matter && (
              <div>
                <p className="mb-1 text-[13px] font-medium">{t("ai.documents")}</p>
                <p className="mb-2 text-[11.5px] text-ink-subtle">{allowDocuments ? t("ai.documentsHint") : t("settings.ai.documentsHint")}</p>
                <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-line p-1.5 scrollbar-thin">
                  {documents.length === 0 && <p className="px-2 py-3 text-center text-[12.5px] text-ink-subtle">{t("documents.empty")}</p>}
                  {documents.map((d) => (
                    <label key={d.id} className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-surface-muted", !allowDocuments && "opacity-50")}>
                      <input type="checkbox" disabled={!allowDocuments || d.textStatus !== "DONE"} checked={docs.includes(d.id)} onChange={(e) => setDocs(e.target.checked ? [...docs, d.id] : docs.filter((x) => x !== d.id))} className="accent-[var(--accent)]" />
                      <FileText className="size-3.5 text-ink-subtle" />
                      <span className="flex-1 truncate">{d.title}</span>
                      {d.textStatus !== "DONE" ? <Badge tone="warning">{t(`enums.processingStatus.${d.textStatus}`)}</Badge> : d.pages && <span className="text-[11px] text-ink-subtle">{d.pages}p</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Field label={t("ai.instructions")}>{(a) => <Textarea {...a} rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t("ai.instructionsPlaceholder")} />}</Field>
            <Field label={t("ai.targetLanguage")}>{(a) => <Select {...a} value={lang} onChange={(e) => setLang(e.target.value as never)}><option value="ar">{t("clients.langAr")}</option><option value="en">{t("clients.langEn")}</option></Select>}</Field>
            {task === "EXTRACT" && <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">{t("ai.deadlineWarning")}</p>}
            <Button variant="primary" loading={pending} disabled={!available || !matter} onClick={submit}><Sparkles /> {pending ? t("ai.running") : t("ai.run")}</Button>
          </div>
        </Panel>

        <Panel title={t("ai.history")} icon={<Bot />}>
          {jobs.length === 0 ? <EmptyState compact title={t("ai.empty")} /> : (
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => setOpenId(j.id)} className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-start text-[13px] hover:bg-surface-muted/60", openId === j.id && "bg-accent-soft/50")}>
                    <span className="flex-1 truncate">{t(`ai.tasks.${j.kind}`)} <span className="ltr-nums text-[11.5px] text-ink-subtle">· {j.matter}</span></span>
                    <Badge tone={j.status === "SUCCEEDED" ? (j.reviewStatus === "ACCEPTED" ? "success" : j.reviewStatus === "DISCARDED" ? "outline" : "warning") : j.status === "FAILED" ? "danger" : "info"}>
                      {j.status === "SUCCEEDED" ? (j.reviewStatus === "REVIEW_REQUIRED" ? t("ai.reviewRequired").split("—")[0] : j.reviewStatus) : j.status}
                    </Badge>
                    <span className="text-[11px] text-ink-subtle">{relativeTime(j.createdAt, locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="xl:col-span-7">
        {job ? <JobResult key={job.id} job={job} /> : <div className="rounded-lg border border-dashed border-line-strong"><EmptyState icon={<Sparkles />} title={t("ai.result")} /></div>}
      </div>
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
    <label className="flex cursor-pointer items-start gap-2.5 px-4 py-2.5 text-[13px] hover:bg-surface-muted/50">
      <input type="checkbox" checked={sel.includes(i)} onChange={() => toggle(i)} className="mt-0.5 accent-[var(--accent)]" />
      <div className="min-w-0 flex-1">{children}{src && <p className="text-[11.5px] text-ink-subtle"><Quote className="me-1 inline size-3" />{src.document}{src.page ? ` — p. ${src.page}` : ""}</p>}</div>
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
      <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-[12px] font-medium text-warning"><AlertTriangle className="me-1 inline size-3.5" /> {t("ai.reviewRequired")}</div>
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
            <div className="space-y-4 p-4 text-[13px]">
              {(["parties", "dates", "amounts"] as const).map((k) => Array.isArray(s[k]) && (s[k] as unknown[]).length > 0 && (
                <div key={k}>
                  <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">{k}</p>
                  <ul className="space-y-1">{(s[k] as Record<string, string | number | null>[]).map((x, i) => <li key={i} className="text-ink">{Object.entries(x).filter(([kk]) => !["document", "page"].includes(kk)).map(([, v]) => v).join(" · ")} <span className="text-[11.5px] text-ink-subtle">— {x.document}{x.page ? `, p. ${x.page}` : ""}</span></li>)}</ul>
                </div>
              ))}
              <div>
                <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">{t("deadlines.title")}</p>
                <div className="-mx-4 divide-y divide-line">{(s.deadlines as { due: string; description: string; type: string; document: string; page: number | null }[]).map((d, i) => <Row key={i} i={i} src={d}><p className="text-ink"><span className="ltr-nums me-2 font-mono text-[12px]">{d.due}</span>{d.description} <Badge tone="warning">{t("enums.verification.NEEDS_VERIFICATION")}</Badge></p></Row>)}</div>
                <Button size="sm" variant="primary" className="mt-2" disabled={!sel.length} loading={pending} onClick={() => apply("deadlines")}><CalendarPlus /> {t("deadlines.new")}</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{job.output}</div>
          {job.citations.length > 0 && (
            <div className="mt-5 border-t border-line pt-3">
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">{t("ai.sources")}</p>
              <ul className="space-y-2">
                {job.citations.map((c, i) => (
                  <li key={i} className="rounded-md bg-surface-muted p-2.5 text-[12.5px]">
                    <p className="font-medium text-ink">{c.documentId ? <Link href={`/app/documents/${c.documentId}`} className="hover:underline">{c.document}</Link> : c.document}{c.page ? ` — p. ${c.page}` : ""}</p>
                    <p className="mt-0.5 line-clamp-3 text-ink-muted">“{c.quote}”</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {job.tokens > 0 && <p className="mt-3 text-end text-[11px] text-ink-subtle">{job.tokens.toLocaleString()} {t("ai.tokens")}</p>}
        </div>
      )}
    </Panel>
  );
}

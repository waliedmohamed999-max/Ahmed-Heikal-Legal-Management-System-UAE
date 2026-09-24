"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Paperclip, Sparkles, Bot, User } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction, useServerForm } from "@/components/forms";
import { formatDate, formatTime, toZonedLocalInput } from "@/lib/time";
import { timelineSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { addTimelineAction, decideTimelineAction } from "../../actions";

type Ev = {
  id: string; eventType: string; title: string; description: string | null; notes: string | null; occurredAt: string; source: string; status: string;
  user: string | null; documents: { id: string; title: string }[]; citations: { document: string; page?: number }[] | null;
};

const TYPES = ["DOCUMENTS_RECEIVED", "CLAIM_SUBMITTED", "HEARING", "EXPERT_ASSIGNED", "EXPERT_MEETING", "EXPERT_REPORT", "JUDGMENT", "APPEAL", "EXECUTION", "SETTLEMENT", "NOTICE", "OTHER"];
const TONE: Record<string, string> = {
  CASE_CREATED: "var(--ink-subtle)", HEARING: "var(--ev-hearing)", HEARING_REPORT: "var(--ev-hearing)", HEARING_SCHEDULED: "var(--ev-hearing)", HEARING_RESCHEDULED: "var(--ev-hearing)",
  JUDGMENT: "var(--critical)", APPEAL: "var(--high)", EXPERT_ASSIGNED: "var(--ev-expert)", EXPERT_MEETING: "var(--ev-expert)", EXPERT_REPORT: "var(--ev-expert)",
  CLAIM_SUBMITTED: "var(--ev-submission)", DOCUMENTS_RECEIVED: "var(--ev-client-meeting)", EXECUTION: "var(--success)", CASE_CLOSED: "var(--ink)",
};

export function TimelineView({ matterId, canEdit, events, documents }: { matterId: string; canEdit: boolean; events: Ev[]; documents: { id: string; title: string }[] }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  const proposed = events.filter((e) => e.status === "PROPOSED");
  const confirmed = events.filter((e) => e.status === "CONFIRMED");
  const typeLabel = (k: string) => {
    const v = t(`workspace.eventTypes.${k}`);
    return v === k ? k.replaceAll("_", " ").toLowerCase() : v;
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-8">
        <Panel
          title={t("workspace.tabs.timeline")}
          actions={canEdit && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus /> {t("workspace.timelineAdd")}</Button>}
        >
          {confirmed.length === 0 ? (
            <EmptyState title={t("workspace.timelineEmpty")} />
          ) : (
            <ol className="relative px-5 py-5">
              {confirmed.map((e, i) => (
                <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < confirmed.length - 1 && <span aria-hidden className="absolute start-[7px] top-4 h-full w-px bg-line-strong" />}
                  <span aria-hidden className="relative mt-1 size-[15px] shrink-0 rounded-full border-[3px] border-surface ring-1 ring-line-strong" style={{ background: TONE[e.eventType] ?? "var(--accent)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <time className="text-meta font-medium tabular text-ink-muted" dateTime={e.occurredAt}>{formatDate(e.occurredAt, locale, tz)}</time>
                      <span className="text-caption font-medium uppercase tracking-wide" style={{ color: TONE[e.eventType] ?? "var(--accent)" }}>{typeLabel(e.eventType)}</span>
                      {e.source === "SYSTEM" && <Badge tone="outline">{t("enums.eventSource.AUTOMATION")}</Badge>}
                      {e.source === "AI" && <Badge tone="info"><Sparkles /> AI</Badge>}
                    </div>
                    <p className="mt-0.5 text-ui font-medium text-ink">{e.title}</p>
                    {e.description && <p className="bidi-plain mt-1 whitespace-pre-line text-body text-ink-muted">{e.description}</p>}
                    {e.notes && <p className="mt-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-meta text-ink-muted">{e.notes}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-meta text-ink-subtle">
                      {e.user && <span className="inline-flex items-center gap-1"><User className="size-3" /> {e.user}</span>}
                      <span>{formatTime(e.occurredAt, locale, tz)}</span>
                      {e.documents.map((d) => (
                        <Link key={d.id} href={`/app/documents/${d.id}`} className="inline-flex items-center gap-1 text-accent hover:underline"><Paperclip className="size-3" /> {d.title}</Link>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="xl:col-span-4">
        <Panel title={`${t("workspace.proposed")} (${proposed.length})`} icon={<Bot />}>
          {proposed.length === 0 ? (
            <EmptyState compact title="—" body={t("common.aiGenerated")} />
          ) : (
            <ul className="divide-y divide-line">
              {proposed.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <Badge tone="warning">{t("common.aiGenerated")}</Badge>
                  <p className="mt-1.5 text-meta tabular text-ink-muted">{formatDate(e.occurredAt, locale, tz)}</p>
                  <p className="text-body font-medium text-ink">{e.title}</p>
                  {e.citations?.map((c, i) => (
                    <p key={i} className="text-meta text-ink-subtle">{c.document}{c.page ? ` — p. ${c.page}` : ""}</p>
                  ))}
                  {canEdit && (
                    <div className="mt-2 flex gap-2">
                      <Button size="xs" variant="primary" loading={pending} onClick={() => run(() => decideTimelineAction({ id: e.id, matterId, decision: "CONFIRMED" }), { onSuccess: () => router.refresh() })}>
                        <Check /> {t("workspace.approve")}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => run(() => decideTimelineAction({ id: e.id, matterId, decision: "REJECTED" }), { onSuccess: () => router.refresh() })}>
                        <X /> {t("workspace.reject")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        {open && <AddEventDialog matterId={matterId} documents={documents} types={TYPES} typeLabel={typeLabel} onDone={() => { setOpen(false); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

function AddEventDialog({ matterId, documents, types, typeLabel, onDone }: { matterId: string; documents: { id: string; title: string }[]; types: string[]; typeLabel: (k: string) => string; onDone: () => void }) {
  const { t, tz } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: timelineSchema,
    defaultValues: { matterId, eventType: "OTHER", title: "", occurredAt: toZonedLocalInput(new Date(), tz), documentIds: [] },
    action: addTimelineAction,
    onSuccess: onDone,
    successMessage: t("common.changesSaved"),
  });
  const selected = new Set(form.watch("documentIds") ?? []);
  return (
    <DialogContent title={t("workspace.timelineAdd")}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("workspace.eventType")}>{(a) => <Select {...a} {...form.register("eventType")}>{types.map((x) => <option key={x} value={x}>{typeLabel(x)}</option>)}</Select>}</Field>
          <Field label={t("common.date")} error={err("occurredAt")} required>{(a) => <Input {...a} type="datetime-local" {...form.register("occurredAt")} />}</Field>
        </div>
        <Field label={t("common.title")} error={err("title")} required>{(a) => <Input {...a} {...form.register("title")} />}</Field>
        <Field label={t("common.description")}>{(a) => <Textarea {...a} rows={3} {...form.register("description")} />}</Field>
        <Field label={t("common.notes")}>{(a) => <Textarea {...a} rows={2} {...form.register("notes")} />}</Field>
        {documents.length > 0 && (
          <div>
            <p className="mb-1.5 text-body font-medium">{t("workspace.tabs.documents")}</p>
            <div className="max-h-36 overflow-y-auto rounded-md border border-line p-1.5 scrollbar-thin">
              {documents.map((d) => (
                <label key={d.id} className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-body hover:bg-surface-muted")}>
                  <input type="checkbox" checked={selected.has(d.id)} className="accent-[var(--accent)]"
                    onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(d.id); else n.delete(d.id); form.setValue("documentIds", [...n]); }} />
                  {d.title}
                </label>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

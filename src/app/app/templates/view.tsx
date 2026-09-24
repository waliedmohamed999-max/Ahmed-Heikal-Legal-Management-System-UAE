"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, FileStack, Wand2, Copy, NotebookPen, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { useI18n } from "@/i18n/client";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { useAction, useServerForm } from "@/components/forms";
import { TEMPLATE_KINDS, TEMPLATE_PLACEHOLDERS, templateSchema } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { deleteTemplateAction, generateTemplateAction, saveDraftAsNoteAction, saveTemplateAction } from "../knowledge/actions";

type Row = z.input<typeof templateSchema> & { id: string };

export function TemplatesView({ rows, canManage, canNote }: { rows: Row[]; canManage: boolean; canNote: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [sel, setSel] = useState<Row | null>(rows[0] ?? null);
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const [matter, setMatter] = useState<{ id: string; label: string } | null>(null);
  const [draft, setDraft] = useState<{ text: string; missing: string[]; locale: string } | null>(null);

  const generate = () => sel && matter && run(() => generateTemplateAction({ templateId: sel.id, matterId: matter.id }), { onSuccess: (r) => setDraft(r) });
  const saveNote = () => draft && matter && run(() => saveDraftAsNoteAction({ matterId: matter.id, body: draft.text, visibility: "TEAM", pinned: false }), { success: t("cms.saved") });

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
      <Panel title={t("templatesPage.title")} icon={<FileStack />} actions={canManage && <Button size="xs" variant="secondary" onClick={() => setEdit("new")}><Plus /> {t("templatesPage.new")}</Button>}>
        {rows.length === 0 ? <EmptyState compact title={t("templatesPage.empty")} /> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => { setSel(r); setDraft(null); }} className={cn("flex w-full flex-col items-start gap-1 px-4 py-3 text-start hover:bg-surface-muted/60", sel?.id === r.id && "bg-accent-soft/60")}>
                  <span className="text-body font-medium text-ink" dir="auto">{r.name}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone="neutral">{t(`templatesPage.kinds.${r.kind}`)}</Badge>
                    <span className="text-caption uppercase text-ink-subtle">{r.locale}</span>
                    {!r.active && <Badge tone="warning">{t("cms.draft")}</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {sel ? (
        <div className="space-y-5">
          <Panel
            title={sel.name}
            actions={canManage && (
              <div className="flex gap-1">
                <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEdit(sel)}><Pencil /></Button>
                <Button size="icon-xs" variant="danger-ghost" aria-label={t("common.delete")} onClick={() => run(() => deleteTemplateAction({ id: sel.id }), { onSuccess: () => { setSel(null); router.refresh(); } })}><Trash2 /></Button>
              </div>
            )}
          >
            <pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap p-4 font-sans text-body leading-7 text-ink-muted" dir={sel.locale === "ar" ? "rtl" : "ltr"}>{sel.body}</pre>
          </Panel>
          <Panel title={t("templatesPage.generate")} icon={<Wand2 />}>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-[260px] flex-1"><Picker type="matters" value={matter?.id} onChange={(i) => { setMatter(i ? { id: i.id, label: i.label } : null); setDraft(null); }} /></div>
              <Button variant="primary" disabled={!matter} loading={pending} onClick={generate}><Wand2 /> {t("templatesPage.generate")}</Button>
            </div>
            {draft && (
              <div className="border-t border-line p-4">
                {draft.missing.length > 0 && (
                  <p className="mb-3 flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-meta text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span dir="ltr" className="font-mono">{draft.missing.map((m) => `[[${m}]]`).join("  ")}</span>
                  </p>
                )}
                <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={14} dir={draft.locale === "ar" ? "rtl" : "ltr"} aria-label={t("templatesPage.generated")} />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(draft.text); toast.success(t("common.copied")); }}><Copy /> {t("common.copy")}</Button>
                  {canNote && <Button variant="secondary" loading={pending} onClick={saveNote}><NotebookPen /> {t("templatesPage.saveAsNote")}</Button>}
                </div>
              </div>
            )}
          </Panel>
        </div>
      ) : <EmptyState icon={<FileStack />} title={t("templatesPage.empty")} />}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && <EditDialog row={edit === "new" ? null : edit} onDone={() => { setEdit(null); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

function EditDialog({ row, onDone }: { row: Row | null; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: templateSchema,
    defaultValues: row ?? { id: "", kind: "CLIENT_UPDATE", name: "", locale: "ar", body: "", active: true },
    action: saveTemplateAction,
    successMessage: t("cms.saved"),
    onSuccess: onDone,
  });
  const r = form.register;
  const insert = (k: string) => form.setValue("body", `${form.getValues("body") ?? ""}{{${k}}}`, { shouldDirty: true });
  return (
    <DialogContent title={row ? t("common.edit") : t("templatesPage.new")} size="xl">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3" noValidate>
        <Field label={t("common.name")} error={err("name")} required className="sm:col-span-3">{(a) => <Input {...a} {...r("name")} />}</Field>
        <Field label={t("common.type")}>{(a) => <Select {...a} {...r("kind")}>{TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{t(`templatesPage.kinds.${k}`)}</option>)}</Select>}</Field>
        <Field label={t("cms.locale")}>{(a) => <Select {...a} {...r("locale")}><option value="ar">العربية</option><option value="en">English</option></Select>}</Field>
        <Checkbox label={t("templatesPage.active")} {...r("active")} className="self-end pb-2" />
        <Field label={t("cms.body")} error={err("body")} required className="sm:col-span-3">{(a) => <Textarea {...a} rows={12} dir={form.watch("locale") === "ar" ? "rtl" : "ltr"} {...r("body")} />}</Field>
        <div className="sm:col-span-3">
          <p className="mb-1.5 text-meta font-medium text-ink-muted">{t("templatesPage.placeholders")}</p>
          <div className="flex flex-wrap gap-1.5" dir="ltr">
            {TEMPLATE_PLACEHOLDERS.map((k) => <button key={k} type="button" onClick={() => insert(k)} className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-meta text-ink-muted hover:border-accent hover:text-accent">{`{{${k}}}`}</button>)}
          </div>
        </div>
        <DialogFooter className="sm:col-span-3"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

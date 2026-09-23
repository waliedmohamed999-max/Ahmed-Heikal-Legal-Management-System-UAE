"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, BookOpen, Lock } from "lucide-react";
import type { z } from "zod";
import { useI18n } from "@/i18n/client";
import { EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAction, useServerForm } from "@/components/forms";
import { KNOWLEDGE_KINDS, knowledgeSchema } from "@/lib/templates";
import { formatDate } from "@/lib/time";
import { deleteKnowledgeAction, saveKnowledgeAction } from "./actions";

type Row = z.input<typeof knowledgeSchema> & { id: string; updatedAt: string };

export function KnowledgeView({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run } = useAction();
  const [open, setOpen] = useState<Row | null>(null);
  const [edit, setEdit] = useState<Row | "new" | null>(null);

  return (
    <div className="mt-4">
      {canManage && <div className="mb-3 flex justify-end"><Button variant="primary" size="sm" onClick={() => setEdit("new")}><Plus /> {t("knowledge.new")}</Button></div>}
      {rows.length === 0 ? (
        <EmptyState icon={<BookOpen />} title={t("knowledge.empty")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="h-full w-full rounded-lg border border-line bg-surface p-4 text-start shadow-xs transition hover:border-line-strong">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{t(`knowledge.kinds.${r.kind}`)}</Badge>
                  {r.confidentiality === "CONFIDENTIAL" && <Lock className="size-3.5 text-warning" aria-label={t("enums.confidentiality.CONFIDENTIAL")} />}
                  <span className="ms-auto text-[11.5px] text-ink-subtle">{formatDate(r.updatedAt, locale)}</span>
                </div>
                <p className="mt-2 text-[14px] font-semibold text-ink" dir="auto">{r.title}</p>
                <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-muted" dir="auto">{r.body}</p>
                {r.tags && <p className="mt-2 flex flex-wrap gap-1">{r.tags.split(",").map((x) => <span key={x} className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-ink-muted">{x.trim()}</span>)}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent title={open.title} size="xl">
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-[13.5px] leading-7 text-ink" dir={open.locale === "ar" ? "rtl" : "ltr"}>{open.body}</div>
            {canManage && (
              <DialogFooter>
                <Button variant="danger-ghost" onClick={() => run(() => deleteKnowledgeAction({ id: open.id }), { onSuccess: () => { setOpen(null); router.refresh(); } })}><Trash2 /> {t("common.delete")}</Button>
                <Button variant="secondary" onClick={() => { setEdit(open); setOpen(null); }}><Pencil /> {t("common.edit")}</Button>
              </DialogFooter>
            )}
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && <EditDialog row={edit === "new" ? null : edit} onDone={() => { setEdit(null); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

function EditDialog({ row, onDone }: { row: Row | null; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: knowledgeSchema,
    defaultValues: row ?? { id: "", kind: "LEGAL_NOTE", title: "", body: "", tags: "", locale: "ar", confidentiality: "STANDARD" },
    action: saveKnowledgeAction,
    successMessage: t("cms.saved"),
    onSuccess: onDone,
  });
  const r = form.register;
  const dir = form.watch("locale") === "ar" ? "rtl" : "ltr";
  return (
    <DialogContent title={row ? t("common.edit") : t("knowledge.new")} size="xl">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
        <Field label={t("common.type")}>{(a) => <Select {...a} {...r("kind")}>{KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{t(`knowledge.kinds.${k}`)}</option>)}</Select>}</Field>
        <Field label={t("cms.locale")}>{(a) => <Select {...a} {...r("locale")}><option value="ar">العربية</option><option value="en">English</option></Select>}</Field>
        <Field label={t("intake.confidentiality")}>{(a) => <Select {...a} {...r("confidentiality")}><option value="STANDARD">{t("enums.confidentiality.STANDARD")}</option><option value="CONFIDENTIAL">{t("enums.confidentiality.CONFIDENTIAL")}</option></Select>}</Field>
        <Field label={t("common.title")} error={err("title")} required className="sm:col-span-3">{(a) => <Input {...a} dir={dir} {...r("title")} />}</Field>
        <Field label={t("cms.body")} error={err("body")} required className="sm:col-span-3">{(a) => <Textarea {...a} rows={12} dir={dir} {...r("body")} />}</Field>
        <Field label={t("knowledge.tags")} className="sm:col-span-3">{(a) => <Input {...a} {...r("tags")} />}</Field>
        <DialogFooter className="sm:col-span-3"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

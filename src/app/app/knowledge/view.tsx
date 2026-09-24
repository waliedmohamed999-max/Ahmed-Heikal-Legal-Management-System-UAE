"use client";

import { useState } from "react";
import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { deleteKnowledgeAction, saveKnowledgeAction } from "./actions";

type Row = z.input<typeof knowledgeSchema> & { id: string; updatedAt: string };

export function KnowledgeView({ rows, canManage, kind, counts }: { rows: Row[]; canManage: boolean; kind: string | null; counts: Record<string, number> }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run } = useAction();
  const [selId, setSelId] = useState<string | null>(rows[0]?.id ?? null);
  const sel = rows.find((r) => r.id === selId) ?? rows[0] ?? null;
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mt-4 grid min-h-[60vh] grid-cols-1 overflow-hidden rounded-lg border border-line lg:grid-cols-[210px_minmax(0,340px)_minmax(0,1fr)]">
      {/* Categories */}
      <nav aria-label={t("common.type")} className="border-b border-line bg-canvas p-3 lg:border-b-0 lg:border-e">
        <div className="flex gap-1 overflow-x-auto scrollbar-none lg:block lg:space-y-0.5">
          {[null, ...KNOWLEDGE_KINDS].map((k) => (
            <Link
              key={k ?? "all"}
              href={k ? `/app/knowledge?kind=${k}` : "/app/knowledge"}
              aria-current={kind === k ? "page" : undefined}
              className={cn("flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-body transition-colors", kind === k ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}
            >
              <span className="flex-1 truncate">{k ? t(`knowledge.kinds.${k}`) : t("common.all")}</span>
              <span className="text-meta tabular text-ink-subtle">{k ? counts[k] ?? 0 : total}</span>
            </Link>
          ))}
        </div>
        {canManage && <Button variant="secondary" size="sm" className="mt-3 w-full max-lg:hidden" onClick={() => setEdit("new")}><Plus /> {t("knowledge.new")}</Button>}
      </nav>

      {/* Entries */}
      <div className="min-w-0 border-b border-line lg:border-b-0 lg:border-e">
        {canManage && <div className="border-b border-line p-2 lg:hidden"><Button variant="secondary" size="sm" onClick={() => setEdit("new")}><Plus /> {t("knowledge.new")}</Button></div>}
        {rows.length === 0 ? (
          <EmptyState icon={<BookOpen />} title={t("knowledge.empty")} />
        ) : (
          <ul role="listbox" aria-label={t("knowledge.title")} className="divide-y divide-line/80">
            {rows.map((r) => (
              <li key={r.id} role="option" aria-selected={sel?.id === r.id}>
                <button type="button" onClick={() => setSelId(r.id)} className={cn("block w-full px-4 py-2.5 text-start transition-colors", sel?.id === r.id ? "bg-accent-soft/70" : "hover:bg-surface-muted")}>
                  <span className="flex items-center gap-1.5">
                    {r.confidentiality === "CONFIDENTIAL" && <Lock className="size-3 shrink-0 text-warning" aria-label={t("enums.confidentiality.CONFIDENTIAL")} />}
                    <span className="bidi-plain truncate text-body font-medium text-ink">{r.title}</span>
                  </span>
                  <span className="bidi-plain mt-0.5 line-clamp-2 block text-meta text-ink-muted">{r.body}</span>
                  <span className="mt-1 flex items-center gap-2 text-caption text-ink-subtle">
                    <span>{t(`knowledge.kinds.${r.kind}`)}</span>
                    <span>· {formatDate(r.updatedAt, locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preview */}
      <article className="min-w-0 p-5 lg:p-6">
        {sel ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-meta text-ink-subtle">{t(`knowledge.kinds.${sel.kind}`)} · {formatDate(sel.updatedAt, locale)}</div>
                <h2 className="bidi-plain mt-0.5 text-heading font-semibold text-ink">{sel.title}</h2>
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} onClick={() => setEdit(sel)}><Pencil /></Button>
                  <Button variant="danger-ghost" size="icon-sm" aria-label={t("common.delete")} onClick={() => run(() => deleteKnowledgeAction({ id: sel.id }), { onSuccess: () => router.refresh() })}><Trash2 /></Button>
                </div>
              )}
            </div>
            {sel.tags && <p className="mt-2 flex flex-wrap gap-1">{sel.tags.split(",").map((x) => <span key={x} className="rounded-sm bg-surface-sunken px-1.5 text-caption leading-[18px] text-ink-muted">{x.trim()}</span>)}</p>}
            <div className="mt-4 max-w-[70ch] whitespace-pre-wrap text-ui leading-relaxed text-ink" dir={sel.locale === "ar" ? "rtl" : "ltr"}>{sel.body}</div>
          </>
        ) : (
          <EmptyState compact icon={<BookOpen />} title={t("knowledge.empty")} />
        )}
      </article>

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
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3" noValidate>
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

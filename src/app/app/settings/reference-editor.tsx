"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { saveReferenceAction } from "./actions";

export type FieldDef =
  | { name: string; label: string; type: "text"; dir?: "ltr" | "rtl"; mono?: boolean; required?: boolean }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; empty?: boolean }
  | { name: string; label: string; type: "checkbox" };

type Row = Record<string, unknown> & { id: string };

/** Generic list + dialog editor for flat reference data (jurisdictions, courts, case types). */
export function ReferenceTable({ kind, title, rows, columns, fields, blank }: {
  kind: "jurisdiction" | "court" | "caseType"; title: string; rows: Row[]; columns: { key: string; label: string }[]; fields: FieldDef[]; blank: Record<string, unknown>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const { run, pending } = useAction();
  return (
    <Panel title={title} actions={<Button size="sm" variant="secondary" onClick={() => setEdit({ ...blank, id: "" })}><Plus /> {t("settings.reference.new")}</Button>}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-line text-start text-[11.5px] text-ink-subtle">{columns.map((c) => <th key={c.key} className="px-4 py-2 text-start font-medium">{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-muted/50">
                {columns.map((c) => <td key={c.key} className="px-4 py-2">{String(r[c.key] ?? "—")}</td>)}
                <td className="px-2 text-end"><Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEdit(r)}><Pencil /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={title}>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                f.type === "checkbox" ? (
                  <Checkbox key={f.name} className="sm:col-span-2" label={f.label} checked={!!edit[f.name]} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.checked })} />
                ) : f.type === "select" ? (
                  <Field key={f.name} label={f.label}>{(a) => <Select {...a} value={String(edit[f.name] ?? "")} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })}>{f.empty && <option value="">{t("common.notSet")}</option>}{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>
                ) : (
                  <Field key={f.name} label={f.label} required={f.required}>{(a) => <Input {...a} dir={f.dir} className={f.mono ? "font-mono uppercase" : undefined} value={String(edit[f.name] ?? "")} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })} />}</Field>
                )
              ))}
            </div>
            <DialogFooter><Button variant="primary" loading={pending} onClick={() => run(() => saveReferenceAction({ kind, data: edit }), { success: t("settings.saved"), onSuccess: () => { setEdit(null); router.refresh(); } })}>{t("common.save")}</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Panel>
  );
}

/** Editor for records with ordered child rows (checklist items, workflow stages). */
export function NestedEditor({ kind, title, rows, header, childKey, childFields, blank, blankChild }: {
  kind: "checklist" | "workflow"; title: string; rows: (Row & { display: string; sub?: string })[]; header: FieldDef[]; childKey: "items" | "stages"; childFields: FieldDef[];
  blank: Record<string, unknown>; blankChild: Record<string, unknown>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const children = (edit?.[childKey] as Record<string, unknown>[] | undefined) ?? [];
  const setChild = (i: number, patch: Record<string, unknown>) => setEdit({ ...edit, [childKey]: children.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <Panel title={title} actions={<Button size="sm" variant="secondary" onClick={() => setEdit({ ...blank, id: "", [childKey]: [{ ...blankChild }] })}><Plus /> {t("settings.reference.new")}</Button>}>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">{r.display}{r.sub && <span className="ms-1 text-[12px] text-ink-subtle">· {r.sub}</span>}</div>
            <Badge tone="outline">{(r[childKey] as unknown[]).length}</Badge>
            <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEdit(r)}><Pencil /></Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={title} size="xl">
            <div className="grid gap-4 sm:grid-cols-2">
              {header.map((f) =>
                f.type === "checkbox" ? <Checkbox key={f.name} label={f.label} checked={!!edit[f.name]} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.checked })} /> :
                f.type === "select" ? <Field key={f.name} label={f.label}>{(a) => <Select {...a} value={String(edit[f.name] ?? "")} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })}>{f.empty && <option value="">{t("common.notSet")}</option>}{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field> :
                <Field key={f.name} label={f.label} required={f.required}>{(a) => <Input {...a} dir={f.dir} value={String(edit[f.name] ?? "")} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })} />}</Field>,
              )}
            </div>
            <div className="mt-4 space-y-2">
              {children.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2">
                  <span className="w-6 text-center text-[12px] tabular text-ink-subtle">{i + 1}</span>
                  {childFields.map((f) =>
                    f.type === "checkbox" ? <Checkbox key={f.name} label={f.label} checked={!!c[f.name]} onChange={(e) => setChild(i, { [f.name]: e.target.checked })} /> :
                    <Input key={f.name} placeholder={f.label} aria-label={f.label} dir={f.type === "text" ? f.dir : undefined} className={f.type === "text" && f.mono ? "w-40 font-mono uppercase" : "min-w-40 flex-1"} value={String(c[f.name] ?? "")} onChange={(e) => setChild(i, { [f.name]: e.target.value })} />,
                  )}
                  <Button size="icon-xs" variant="danger-ghost" aria-label={t("common.remove")} onClick={() => setEdit({ ...edit, [childKey]: children.filter((_, j) => j !== i) })}><Trash2 /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, [childKey]: [...children, { ...blankChild }] })}><Plus /> {childKey === "items" ? t("settings.reference.addItem") : t("settings.reference.addStage")}</Button>
            </div>
            <DialogFooter><Button variant="primary" loading={pending} onClick={() => run(() => saveReferenceAction({ kind, data: edit }), { success: t("settings.saved"), onSuccess: () => { setEdit(null); router.refresh(); } })}>{t("common.save")}</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Panel>
  );
}

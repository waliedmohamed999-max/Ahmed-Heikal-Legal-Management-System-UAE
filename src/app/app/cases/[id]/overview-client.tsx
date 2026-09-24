"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Building2, User } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/layout";
import { useAction } from "@/components/forms";
import { cn } from "@/lib/utils";
import { PARTY_ROLES } from "@/lib/schemas";
import { addPartyAction, removePartyAction, toggleChecklistAction, addChecklistAction } from "../actions";

export function PartiesPanel({
  matterId,
  canEdit,
  client,
  parties,
}: {
  matterId: string;
  canEdit: boolean;
  client: { id: string; name: string };
  parties: { id: string; role: string; name: string; contactId: string; type: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ nameEn: "", nameAr: "", role: "OPPONENT", type: "COMPANY" });

  const add = () =>
    run(() => addPartyAction({ matterId, nameEn: form.nameEn, nameAr: form.nameAr || null, role: form.role as never, type: form.type as never }), {
      onSuccess: () => {
        setAdding(false);
        setForm({ nameEn: "", nameAr: "", role: "OPPONENT", type: "COMPANY" });
        router.refresh();
      },
    });

  return (
    <div>
      <ul>
        <li className="flex items-center gap-3 px-3 py-1.5">
          <Building2 className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          <Link href={`/app/clients/${client.id}`} className="min-w-0 flex-1 truncate text-body font-medium text-ink hover:underline">{client.name}</Link>
          <span className="shrink-0 text-meta text-accent">{t("enums.partyRole.CLIENT")}</span>
        </li>
        {parties.map((p) => (
          <li key={p.id} className="group flex items-center gap-3 px-3 py-1.5">
            {p.type === "COMPANY" ? <Building2 className="size-4 shrink-0 text-ink-subtle" aria-hidden /> : <User className="size-4 shrink-0 text-ink-subtle" aria-hidden />}
            <Link href={`/app/contacts?focus=${p.contactId}`} className="bidi-plain min-w-0 flex-1 truncate text-body text-ink hover:underline">{p.name}</Link>
            <span className={cn("shrink-0 text-meta", p.role === "OPPONENT" ? "text-danger" : "text-ink-subtle")}>{t(`enums.partyRole.${p.role}`)}</span>
            {canEdit && (
              <Button variant="ghost" size="icon-xs" aria-label={t("common.remove")} className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => run(() => removePartyAction({ id: p.id, matterId }), { onSuccess: () => router.refresh() })}>
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="px-3 pt-2">
          {adding ? (
            <div className="grid gap-2">
              <Input placeholder={t("intake.partyName")} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} dir="ltr" aria-label={t("intake.partyName")} />
              <Input placeholder={t("intake.partyNameAr")} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} dir="rtl" aria-label={t("intake.partyNameAr")} />
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label={t("common.type")}>
                <option value="COMPANY">{t("enums.partyType.COMPANY")}</option>
                <option value="INDIVIDUAL">{t("enums.partyType.INDIVIDUAL")}</option>
              </Select>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label={t("intake.partyRole")}>
                {PARTY_ROLES.map((r) => <option key={r} value={r}>{t(`enums.partyRole.${r}`)}</option>)}
              </Select>
              <div className="flex gap-1">
                <Button variant="primary" size="sm" disabled={!form.nameEn.trim()} loading={pending} onClick={add}><Check /> {t("common.save")}</Button>
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="xs" className="-ms-2" onClick={() => setAdding(true)}><Plus /> {t("workspace.addParty")}</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ChecklistPanel({ matterId, canEdit, items }: { matterId: string; canEdit: boolean; items: { id: string; title: string; required: boolean; done: boolean }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run } = useAction();
  const [local, setLocal] = useState(items);
  const [title, setTitle] = useState("");

  const toggle = (id: string, done: boolean) => {
    // Optimistic (safe: reversible, server re-validates and re-renders)
    setLocal((l) => l.map((i) => (i.id === id ? { ...i, done } : i)));
    run(() => toggleChecklistAction({ id, done, matterId }), { onSuccess: () => router.refresh() });
  };

  if (!local.length && !canEdit) return <EmptyState compact title={t("workspace.checklistEmpty")} />;
  return (
    <div>
      {local.length === 0 && <EmptyState compact title={t("workspace.checklistEmpty")} />}
      <ul className="grid sm:grid-cols-2">
        {local.map((i) => (
          <li key={i.id}>
            <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-md px-3 py-1.5 text-body hover:bg-surface-muted", !canEdit && "cursor-default")}>
              <input type="checkbox" checked={i.done} disabled={!canEdit} onChange={(e) => toggle(i.id, e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--success)]" />
              <span className={cn("text-ink", i.done && "text-ink-subtle line-through")}>
                {i.title}
                {i.required && !i.done && <span className="ms-1 text-danger" aria-label={t("common.required")}>*</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="mt-1 flex gap-2 px-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            run(() => addChecklistAction({ matterId, title }), { onSuccess: () => { setTitle(""); router.refresh(); } });
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("workspace.addChecklistItem")} aria-label={t("workspace.addChecklistItem")} />
          <Button type="submit" size="sm" variant="secondary" disabled={!title.trim()}><Plus /></Button>
        </form>
      )}
    </div>
  );
}

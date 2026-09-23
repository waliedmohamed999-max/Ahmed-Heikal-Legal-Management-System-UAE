"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Building2, User } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
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
      <ul className="divide-y divide-line">
        <li className="flex items-center gap-3 px-4 py-2.5">
          <Badge tone="brand" className="w-28 justify-center">{t("enums.partyRole.CLIENT")}</Badge>
          <Link href={`/app/clients/${client.id}`} className="text-[13px] font-medium text-ink hover:underline">{client.name}</Link>
        </li>
        {parties.map((p) => (
          <li key={p.id} className="group flex items-center gap-3 px-4 py-2.5">
            <Badge tone={p.role === "OPPONENT" ? "danger" : "neutral"} className="w-28 justify-center">{t(`enums.partyRole.${p.role}`)}</Badge>
            {p.type === "COMPANY" ? <Building2 className="size-4 text-ink-subtle" /> : <User className="size-4 text-ink-subtle" />}
            <Link href={`/app/contacts?focus=${p.contactId}`} className="min-w-0 flex-1 truncate text-[13px] text-ink hover:underline">{p.name}</Link>
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
        <div className="border-t border-line px-4 py-3">
          {adding ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
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
                <Button variant="primary" size="md" disabled={!form.nameEn.trim()} loading={pending} onClick={add}><Check /></Button>
                <Button variant="ghost" size="md" onClick={() => setAdding(false)} aria-label={t("common.cancel")}><X /></Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus /> {t("workspace.addParty")}</Button>
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
            <label className={cn("flex cursor-pointer items-start gap-2.5 px-4 py-2 text-[13px] hover:bg-surface-muted/60", !canEdit && "cursor-default")}>
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
          className="flex gap-2 border-t border-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            run(() => addChecklistAction({ matterId, title }), { onSuccess: () => { setTitle(""); router.refresh(); } });
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("workspace.addChecklistItem")} className="h-8" aria-label={t("workspace.addChecklistItem")} />
          <Button type="submit" size="sm" variant="secondary" disabled={!title.trim()}><Plus /></Button>
        </form>
      )}
    </div>
  );
}

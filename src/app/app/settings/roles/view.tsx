"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Info } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { cn } from "@/lib/utils";
import { saveRoleAction, deleteRoleAction } from "../actions";

type Role = { id: string; key: string; name: string; nameAr: string; label: string; description: string; isSystem: boolean; matterScope: string; permissions: string[]; users: number };

export function RolesView({ roles, catalog }: { roles: Role[]; catalog: { key: string; description: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [selId, setSelId] = useState(roles[0]?.id ?? "new");
  const blank: Role = { id: "", key: "", name: "", nameAr: "", label: "", description: "", isSystem: false, matterScope: "ASSIGNED", permissions: [], users: 0 };
  const sel = roles.find((r) => r.id === selId) ?? blank;
  const [draft, setDraft] = useState<Role>(sel);
  const pick = (id: string) => { setSelId(id); setDraft(roles.find((r) => r.id === id) ?? blank); };
  const modules = Object.entries(catalog.reduce<Record<string, { key: string; description: string }[]>>((acc, p) => ((acc[p.key.split(".")[0]] ??= []).push(p), acc), {}));
  const has = (k: string) => draft.permissions.includes(k);
  const toggle = (k: string) => setDraft({ ...draft, permissions: has(k) ? draft.permissions.filter((x) => x !== k) : [...draft.permissions, k] });
  const owner = draft.key === "owner";

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
      <Panel title={t("settings.roles.title")}>
        <ul className="p-1.5">
          {roles.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r.id)} className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-start text-[13px]", selId === r.id ? "bg-surface-muted font-medium" : "hover:bg-surface-muted/60")}>
                <span className="truncate">{r.label}</span>
                <span className="text-[11px] text-ink-subtle tabular">{r.users}</span>
              </button>
            </li>
          ))}
          <li><button type="button" onClick={() => pick("new")} className={cn("mt-1 flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] text-accent", selId === "new" && "bg-surface-muted")}><Plus className="size-4" /> {t("settings.roles.new")}</button></li>
        </ul>
      </Panel>
      <Panel title={draft.id ? draft.label : t("settings.roles.new")} actions={draft.id && <Badge tone={draft.isSystem ? "neutral" : "info"}>{draft.isSystem ? t("settings.roles.system") : t("settings.roles.custom")}</Badge>}>
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("clients.fields.nameEn")}>{(a) => <Input {...a} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} dir="ltr" />}</Field>
            <Field label={t("clients.fields.nameAr")}>{(a) => <Input {...a} value={draft.nameAr} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} dir="rtl" />}</Field>
            <Field label={t("settings.roles.scope")}>{(a) => <Select {...a} value={draft.matterScope} disabled={owner} onChange={(e) => setDraft({ ...draft, matterScope: e.target.value })}>{["ALL", "ASSIGNED", "NONE"].map((s) => <option key={s} value={s}>{t(`settings.roles.scopes.${s}`)}</option>)}</Select>}</Field>
          </div>
          <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-[12.5px] text-info"><Info className="mt-0.5 size-4 shrink-0" /> {t("settings.roles.confidentialNote")} {owner && t("settings.roles.ownerLocked")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {modules.map(([mod, perms]) => (
              <fieldset key={mod} className="rounded-md border border-line p-3">
                <legend className="px-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">{mod}</legend>
                <div className="space-y-1">
                  {perms.map((p) => (
                    <label key={p.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-[12.5px] hover:bg-surface-muted">
                      <input type="checkbox" checked={has(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 accent-[var(--accent)]" />
                      <span><span className="font-mono text-[11.5px] text-ink" dir="ltr">{p.key}</span><span className="block text-[11.5px] text-ink-subtle" dir="ltr">{p.description}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex justify-between gap-2 border-t border-line pt-3">
            {draft.id && !draft.isSystem && draft.users === 0 ? (
              <Button variant="danger-ghost" onClick={() => run(() => deleteRoleAction({ id: draft.id }), { success: t("settings.saved"), onSuccess: () => { pick(roles[0].id); router.refresh(); } })}><Trash2 /> {t("settings.roles.delete")}</Button>
            ) : <span />}
            <Button variant="primary" loading={pending} disabled={!draft.name.trim()} onClick={() => run(() => saveRoleAction({ id: draft.id, name: draft.name, nameAr: draft.nameAr, description: draft.description, matterScope: draft.matterScope as never, permissions: draft.permissions }), { success: t("settings.saved"), onSuccess: (d) => { router.refresh(); setSelId((d as { id: string }).id); } })}>{t("common.save")}</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Panel, Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select } from "@/components/ui/form";
import { useServerForm } from "@/components/forms";
import { userSchema } from "@/lib/admin-schemas";
import { relativeTime } from "@/lib/time";
import { saveUserAction } from "../actions";

type U = { id: string; email: string; name: string; nameAr: string; position: string; positionAr: string; phone: string; roleId: string; roleName: string; status: string; lastLoginAt: string | null; mfaEnabled: boolean; photoUrl: string | null };

export function UsersView({ users, roles, meId }: { users: U[]; roles: { id: string; name: string }[]; meId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [edit, setEdit] = useState<U | "new" | null>(null);
  return (
    <Panel title={t("settings.users.title")} actions={<Button size="sm" variant="primary" onClick={() => setEdit("new")}><UserPlus /> {t("settings.users.new")}</Button>} footer={<p className="text-meta text-ink-subtle">{t("settings.users.sessionsNote")}</p>}>
      <ul className="divide-y divide-line">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={u.name} src={u.photoUrl} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-ink">{locale === "ar" ? u.nameAr || u.name : u.name} {u.id === meId && <span className="text-meta text-ink-subtle">·</span>}</p>
              <p className="ltr-nums truncate text-meta text-ink-subtle">{u.email}</p>
            </div>
            <Badge tone="neutral">{u.roleName}</Badge>
            {u.mfaEnabled && <Badge tone="success"><ShieldCheck /> MFA</Badge>}
            <Badge tone={u.status === "ACTIVE" ? "success" : "outline"}>{t(`settings.users.statuses.${u.status}`)}</Badge>
            <span className="hidden w-28 text-end text-meta text-ink-subtle sm:block">{u.lastLoginAt ? relativeTime(u.lastLoginAt, locale) : "—"}</span>
            <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEdit(u)}><Pencil /></Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && <UserDialog user={edit === "new" ? null : edit} roles={roles} onDone={() => { setEdit(null); router.refresh(); }} />}
      </Dialog>
    </Panel>
  );
}

function UserDialog({ user, roles, onDone }: { user: U | null; roles: { id: string; name: string }[]; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: userSchema,
    defaultValues: user ? { id: user.id, email: user.email, name: user.name, nameAr: user.nameAr, position: user.position, positionAr: user.positionAr, phone: user.phone, roleId: user.roleId, status: user.status as "ACTIVE", password: "" } : { id: "", email: "", name: "", nameAr: "", position: "", positionAr: "", phone: "", roleId: roles[0]?.id ?? "", status: "ACTIVE", password: "" },
    action: saveUserAction,
    successMessage: t("settings.saved"),
    onSuccess: onDone,
  });
  const r = form.register;
  return (
    <DialogContent title={user ? t("settings.users.edit") : t("settings.users.new")} size="lg">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("clients.fields.nameEn")} error={err("name")} required>{(a) => <Input {...a} dir="ltr" {...r("name")} />}</Field>
        <Field label={t("clients.fields.nameAr")}>{(a) => <Input {...a} dir="rtl" {...r("nameAr")} />}</Field>
        <Field label={t("common.email")} error={err("email")} required>{(a) => <Input {...a} type="email" dir="ltr" {...r("email")} />}</Field>
        <Field label={t("common.phone")}>{(a) => <Input {...a} dir="ltr" {...r("phone")} />}</Field>
        <Field label={`${t("team.member")} (EN)`}>{(a) => <Input {...a} dir="ltr" {...r("position")} />}</Field>
        <Field label={`${t("team.member")} (AR)`}>{(a) => <Input {...a} dir="rtl" {...r("positionAr")} />}</Field>
        <Field label={t("settings.users.role")} error={err("roleId")}>{(a) => <Select {...a} {...r("roleId")}>{roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
        <Field label={t("settings.users.status")}>{(a) => <Select {...a} {...r("status")}>{["ACTIVE", "SUSPENDED"].map((s) => <option key={s} value={s}>{t(`settings.users.statuses.${s}`)}</option>)}</Select>}</Field>
        <Field label={user ? t("settings.users.passwordReset") : t("settings.users.passwordNew")} error={err("password")} hint={t("settings.profile.policy")} className="sm:col-span-2">{(a) => <Input {...a} type="password" autoComplete="new-password" dir="ltr" {...r("password")} />}</Field>
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

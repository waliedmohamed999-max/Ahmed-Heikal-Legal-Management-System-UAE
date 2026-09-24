"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, KeyRound, LogOut, ShieldOff, UserMinus, UserPlus, Copy } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { Field, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { adminResetMfaAction, adminRevokeSessionsAction, inviteUserAction, offboardUserAction, sendResetAction } from "../actions";

type Target = { id: string; name: string; mfaEnabled: boolean; status: string };

/** Shows a one-time link when e-mail is not configured (never stored in the browser). */
function OneTimeLink({ link }: { link: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-meta text-warning">{t("sec.oneTimeLink")}</p>
      <div className="flex gap-2">
        <Input readOnly value={link} dir="ltr" className="font-mono text-caption" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="secondary" size="icon" aria-label="Copy" onClick={() => navigator.clipboard?.writeText(link)}><Copy /></Button>
      </div>
    </div>
  );
}

function StepUpFields({ v, set }: { v: { password: string; totp: string }; set: (x: { password: string; totp: string }) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("auth.password")} hint={t("sec.reauthBody")}>{(a) => <Input {...a} type="password" autoComplete="current-password" dir="ltr" value={v.password} onChange={(e) => set({ ...v, password: e.target.value })} />}</Field>
      <Field label={t("sec.reauthTotp")}>{(a) => <Input {...a} inputMode="numeric" maxLength={6} dir="ltr" className="font-mono tracking-widest" value={v.totp} onChange={(e) => set({ ...v, totp: e.target.value })} />}</Field>
    </div>
  );
}

export function InviteButton({ roles }: { roles: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: "", name: "", roleId: roles[0]?.id ?? "" });
  const [link, setLink] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setLink(null); }}><UserPlus /> {t("sec.invite")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent title={t("sec.invite")}>
            {link ? <OneTimeLink link={link} /> : (
              <form className="grid gap-4" onSubmit={(e) => {
                e.preventDefault();
                run(() => inviteUserAction({ ...f, matterIds: [] }), {
                  onSuccess: (d) => { router.refresh(); if (d.link) setLink(d.link); else { toast.success(t("sec.inviteSent")); setOpen(false); } },
                });
              }}>
                <Field label={t("common.email")} required>{(a) => <Input {...a} type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
                <Field label={t("sec.yourName")}>{(a) => <Input {...a} dir="ltr" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
                <Field label={t("settings.users.role")}>{(a) => <Select {...a} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>
                <DialogFooter><Button type="submit" variant="primary" loading={pending} disabled={!f.email}>{t("sec.invite")}</Button></DialogFooter>
              </form>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function AccountActions({ user, colleagues, isMe }: { user: Target; colleagues: { id: string; name: string }[]; isMe: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [dialog, setDialog] = useState<"link" | "mfa" | "offboard" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [step, setStep] = useState({ password: "", totp: "" });
  const [transferTo, setTransferTo] = useState(colleagues.find((c) => c.id !== user.id)?.id ?? "");
  const close = () => { setDialog(null); setStep({ password: "", totp: "" }); setLink(null); };
  if (isMe) return null;
  return (
    <>
      <Menu>
        <MenuTrigger asChild><Button size="icon-xs" variant="ghost" aria-label={t("common.more")}><MoreHorizontal /></Button></MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => run(() => sendResetAction({ userId: user.id }), { onSuccess: (d) => { if (d.link) { setLink(d.link); setDialog("link"); } else toast.success(t("sec.inviteSent")); } })}><KeyRound /> {t("sec.sendReset")}</MenuItem>
          <MenuItem onSelect={() => run(() => adminRevokeSessionsAction({ userId: user.id }), { success: t("sec.sessionsRevoked") })}><LogOut /> {t("sec.revokeSessions")}</MenuItem>
          {user.mfaEnabled && <MenuItem onSelect={() => setDialog("mfa")}><ShieldOff /> {t("sec.resetMfa")}</MenuItem>}
          {user.status === "ACTIVE" && (<><MenuSeparator /><MenuItem destructive onSelect={() => setDialog("offboard")}><UserMinus /> {t("sec.offboard")}</MenuItem></>)}
        </MenuContent>
      </Menu>
      <Dialog open={!!dialog} onOpenChange={(o) => !o && close()}>
        {dialog === "link" && link && <DialogContent title={t("sec.sendReset")}><OneTimeLink link={link} /></DialogContent>}
        {dialog === "mfa" && (
          <DialogContent title={`${t("sec.resetMfa")} — ${user.name}`}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => adminResetMfaAction({ userId: user.id, password: step.password, totp: step.totp || undefined }), { success: t("settings.saved"), onSuccess: () => { close(); router.refresh(); } }); }}>
              <p className="text-body text-ink-muted">{t("sec.resetMfaBody")}</p>
              <StepUpFields v={step} set={setStep} />
              <DialogFooter><Button type="submit" variant="danger" loading={pending} disabled={!step.password}>{t("sec.resetMfa")}</Button></DialogFooter>
            </form>
          </DialogContent>
        )}
        {dialog === "offboard" && (
          <DialogContent title={`${t("sec.offboardTitle")} — ${user.name}`} size="lg">
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              run(() => offboardUserAction({ userId: user.id, transferToId: transferTo, password: step.password, totp: step.totp || null }), {
                onSuccess: (d) => { toast.success(t("sec.offboarded", d as unknown as Record<string, string>)); close(); router.refresh(); },
              });
            }}>
              <p className="text-body text-ink-muted">{t("sec.offboardBody")}</p>
              <Field label={t("sec.transferTo")} required>{(a) => <Select {...a} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>{colleagues.filter((c) => c.id !== user.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
              <StepUpFields v={step} set={setStep} />
              <DialogFooter><Button type="submit" variant="danger" loading={pending} disabled={!step.password || !transferTo}>{t("sec.offboard")}</Button></DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, Monitor, Smartphone, LogOut } from "lucide-react";
import { describeUserAgent } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { relativeTime } from "@/lib/time";
import { changePasswordAction, beginMfaAction, confirmMfaAction, revokeSessionAction } from "../actions";

export function ProfileView({ mfaEnabled, currentSession, user, sessions }: {
  mfaEnabled: boolean; currentSession: string; user: { name: string; email: string; role: string };
  sessions: { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string }[];
}) {
  const [showAll, setShowAll] = useState(false);
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [mfa, setMfa] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  return (
    <div className="space-y-5">
      <Panel title={user.name}>
        <dl className="grid gap-3 p-4 text-body sm:grid-cols-2">
          <div><dt className="text-ink-subtle">{t("common.email")}</dt><dd className="ltr-nums">{user.email}</dd></div>
          <div><dt className="text-ink-subtle">{t("settings.users.role")}</dt><dd>{user.role}</dd></div>
        </dl>
      </Panel>

      <Panel title={t("settings.profile.changePassword")} icon={<KeyRound />}>
        <form className="grid gap-4 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => changePasswordAction(pw), { success: t("settings.saved"), onSuccess: () => setPw({ current: "", next: "" }) }); }}>
          <Field label={t("settings.profile.current")}>{(a) => <Input {...a} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} dir="ltr" />}</Field>
          <Field label={t("settings.profile.next")} hint={t("settings.profile.policy")}>{(a) => <Input {...a} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} dir="ltr" />}</Field>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" variant="primary" loading={pending} disabled={!pw.current || !pw.next}>{t("common.save")}</Button></div>
        </form>
      </Panel>

      <Panel title={t("settings.profile.mfa")} icon={<ShieldCheck />} actions={<Badge tone={mfaEnabled ? "success" : "warning"}>{mfaEnabled ? t("settings.profile.mfaOn") : t("settings.profile.mfaOff")}</Badge>}>
        <div className="space-y-3 p-4">
          {!mfa ? (
            <Button variant="secondary" loading={pending} onClick={() => run(() => beginMfaAction({}), { onSuccess: setMfa })}>{t("settings.profile.mfaSetup")}</Button>
          ) : (
            <div className="space-y-3">
              <p className="text-body text-ink-muted">{t("settings.profile.mfaScan")}</p>
              <div className="rounded-md border border-line bg-surface-muted p-3">
                <p className="text-meta text-ink-subtle">{t("settings.profile.mfaSecret")}</p>
                <p className="ltr-nums select-all break-all font-mono text-ui tracking-wider text-ink">{mfa.secret}</p>
                <p className="ltr-nums mt-2 break-all font-mono text-caption text-ink-subtle">{mfa.uri}</p>
              </div>
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className="w-36 font-mono tracking-widest" dir="ltr" aria-label={t("auth.mfaCode")} />
                <Button variant="primary" loading={pending} onClick={() => run(() => confirmMfaAction({ code }), { onSuccess: (d) => { if ((d as { ok: boolean }).ok) { setMfa(null); router.refresh(); } } })}>{t("settings.profile.mfaConfirm")}</Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title={t("settings.profile.sessions")} icon={<Monitor />}>
        <ul className="divide-y divide-line/80">
          {(showAll ? sessions : sessions.slice(0, 5)).map((s) => {
            const ua = describeUserAgent(s.userAgent);
            const Icon = ua.mobile ? Smartphone : Monitor;
            return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-body">
              <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink" title={s.userAgent ?? undefined}>{ua.label}</p>
                <p className="ltr-nums text-meta text-ink-subtle" suppressHydrationWarning>{s.ip ?? "—"} · {relativeTime(s.lastSeenAt, locale)}</p>
              </div>
              {s.id === currentSession ? <Badge tone="success">{t("settings.profile.thisSession")}</Badge> : (
                <Button size="xs" variant="ghost" onClick={() => run(() => revokeSessionAction({ id: s.id }), { onSuccess: () => router.refresh() })}><LogOut /> {t("settings.profile.revoke")}</Button>
              )}
            </li>
            );
          })}
        </ul>
        {sessions.length > 5 && (
          <div className="border-t border-line px-4 py-2">
            <Button variant="ghost" size="xs" className="-ms-2" onClick={() => setShowAll((v) => !v)}>{showAll ? t("common.showLess") : `${t("common.showMore")} (${sessions.length - 5})`}</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

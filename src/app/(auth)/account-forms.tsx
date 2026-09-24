"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";
import { acceptInvitationAction, forgotPasswordAction, mfaSetupBeginAction, mfaSetupConfirmAction, resetPasswordAction } from "./actions";

/**
 * Tokens arrive in the URL fragment (#…) so they are never sent to the server in the
 * request line, access logs or Referer headers. Read it on the client only.
 */
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
function useFragmentToken() {
  return useSyncExternalStore(subscribe, () => window.location.hash.replace(/^#/, ""), () => "");
}

function Alert({ tone, children }: { tone: "danger" | "success"; children: React.ReactNode }) {
  const Icon = tone === "danger" ? AlertCircle : CheckCircle2;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={tone === "danger" ? "flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-body text-danger" : "flex items-start gap-2 rounded-md border border-success/20 bg-success-soft px-3 py-2.5 text-body text-success"}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);
  if (state?.sent) return <div className="space-y-4"><Alert tone="success">{t("sec.forgotSent")}</Alert><BackToLogin /></div>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert tone="danger">{t(`errors.${state.error === "invalid" ? "validation" : state.error}`)}</Alert>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required dir="ltr" className="h-10" autoFocus />
      </div>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">{t("sec.sendLink")}</Button>
      <BackToLogin />
    </form>
  );
}

function BackToLogin() {
  const { t } = useI18n();
  return <p className="text-center text-body"><Link href="/login" className="text-accent hover:underline">{t("sec.backToLogin")}</Link></p>;
}

function PasswordPair({ pw, setPw }: { pw: { a: string; b: string }; setPw: (v: { a: string; b: string }) => void }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw">{t("sec.newPassword")}</Label>
        <Input id="pw" type="password" autoComplete="new-password" dir="ltr" className="h-10" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
        <p className="text-meta text-ink-subtle">{t("settings.profile.policy")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw2">{t("sec.confirmPassword")}</Label>
        <Input id="pw2" type="password" autoComplete="new-password" dir="ltr" className="h-10" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
      </div>
    </>
  );
}

export function ResetForm() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useFragmentToken();
  const [pw, setPw] = useState({ a: "", b: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"STAFF" | "CLIENT" | null>(null);
  const [pending, setPending] = useState(false);
  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t("sec.resetDone")}</Alert>
        <Button variant="primary" size="lg" className="w-full" onClick={() => router.push(done === "CLIENT" ? "/portal/login" : "/login")}>{t("auth.signIn")}</Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.a !== pw.b) return setError(t("sec.mismatch"));
        setPending(true);
        const r = await resetPasswordAction(token, pw.a);
        setPending(false);
        if (r.ok) {
          history.replaceState(null, "", window.location.pathname); // drop the token from the address bar
          setDone(r.realm);
        } else setError(t(`errors.${r.error}`));
      }}
    >
      {!token && <Alert tone="danger">{t("errors.tokenInvalid")}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <PasswordPair pw={pw} setPw={setPw} />
      <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!token || !pw.a} className="w-full">{t("common.save")}</Button>
    </form>
  );
}

export function InviteForm() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useFragmentToken();
  const [name, setName] = useState({ en: "", ar: "" });
  const [pw, setPw] = useState({ a: "", b: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t("sec.inviteDone")}</Alert>
        <Button variant="primary" size="lg" className="w-full" onClick={() => router.push("/login")}>{t("auth.signIn")}</Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.a !== pw.b) return setError(t("sec.mismatch"));
        setPending(true);
        const r = await acceptInvitationAction({ token, name: name.en, nameAr: name.ar, password: pw.a });
        setPending(false);
        if (r.ok) {
          history.replaceState(null, "", window.location.pathname);
          setDone(true);
        } else setError(t(`errors.${r.error}`));
      }}
    >
      {!token && <Alert tone="danger">{t("errors.tokenInvalid")}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("sec.yourName")}</Label>
        <Input id="name" dir="ltr" className="h-10" value={name.en} onChange={(e) => setName({ ...name, en: e.target.value })} autoComplete="name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nameAr">{t("sec.yourNameAr")}</Label>
        <Input id="nameAr" dir="rtl" className="h-10" value={name.ar} onChange={(e) => setName({ ...name, ar: e.target.value })} />
      </div>
      <PasswordPair pw={pw} setPw={setPw} />
      <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!token || !pw.a || !name.en} className="w-full">{t("sec.accept")}</Button>
    </form>
  );
}

/** Recovery codes, shown exactly once after (re-)enrolment. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <p className="text-body font-medium text-ink">{t("sec.recoveryTitle")}</p>
      <p className="text-meta text-ink-muted">{t("sec.recoveryBody")}</p>
      <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-line bg-surface-muted p-3 font-mono text-ui tracking-wider text-ink" dir="ltr">
        {codes.map((c) => <li key={c} className="select-all">{c}</li>)}
      </ul>
      <Button variant="primary" className="w-full" onClick={onDone}>{t("sec.recoverySaved")}</Button>
    </div>
  );
}

/** Forced enrolment when the user's role requires MFA. */
export function MfaSetupForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (codes) return <RecoveryCodes codes={codes} onDone={() => router.replace("/app")} />;
  if (!setup) {
    return (
      <Button variant="primary" size="lg" className="w-full" loading={pending} onClick={async () => {
        setPending(true);
        const r = await mfaSetupBeginAction();
        setPending(false);
        if ("error" in r) setError(t(`errors.${r.error}`)); else setSetup(r);
      }}>{t("sec.mfaStart")}</Button>
    );
  }
  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-body text-ink-muted">{t("settings.profile.mfaScan")}</p>
      <div className="rounded-md border border-line bg-surface-muted p-3">
        <p className="text-meta text-ink-subtle">{t("settings.profile.mfaSecret")}</p>
        <p className="ltr-nums select-all break-all font-mono text-ui tracking-wider text-ink">{setup.secret}</p>
        <p className="ltr-nums mt-2 break-all font-mono text-caption text-ink-subtle">{setup.uri}</p>
      </div>
      <div className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className="w-36 font-mono tracking-widest" dir="ltr" aria-label={t("auth.mfaCode")} />
        <Button variant="primary" loading={pending} onClick={async () => {
          setPending(true);
          const r = await mfaSetupConfirmAction(code);
          setPending(false);
          if ("error" in r) setError(t("auth.mfaInvalid")); else setCodes(r.codes);
        }}>{t("settings.profile.mfaConfirm")}</Button>
      </div>
    </div>
  );
}

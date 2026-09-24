"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { stepUpAction } from "../actions";

/** File download (an API route, not a page). */
function download() {
  const a = document.createElement("a");
  a.href = "/api/admin/export";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Owner export: re-authenticate, then download (the API refuses without a step-up in the last 5 minutes). */
export function OfficeExport({ mfa }: { mfa: boolean }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [v, setV] = useState({ password: "", totp: "" });
  return (
    <Panel title={t("sec.exportTitle")} icon={<Download />}>
      <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); run(() => stepUpAction({ password: v.password, totp: v.totp || undefined }), { onSuccess: () => { setV({ password: "", totp: "" }); download(); } }); }}>
        <p className="text-body text-ink-muted">{t("sec.exportBody")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("auth.password")}>{(a) => <Input {...a} type="password" autoComplete="current-password" dir="ltr" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />}</Field>
          {mfa && <Field label={t("sec.reauthTotp")}>{(a) => <Input {...a} inputMode="numeric" maxLength={6} dir="ltr" className="font-mono tracking-widest" value={v.totp} onChange={(e) => setV({ ...v, totp: e.target.value })} />}</Field>}
        </div>
        <div className="flex justify-end"><Button type="submit" variant="secondary" loading={pending} disabled={!v.password}><Download /> {t("sec.exportButton")}</Button></div>
      </form>
    </Panel>
  );
}

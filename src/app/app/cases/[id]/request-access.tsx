"use client";

import { useState } from "react";
import { KeyRound, Clock } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { requestAccessAction } from "../actions";

export function RequestAccess({ matterId, pending }: { matterId: string; pending: boolean }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(pending);
  const [reason, setReason] = useState("");
  const { run, pending: busy } = useAction();
  if (sent) {
    return (
      <p className="inline-flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
        <Clock className="size-4" /> {t("workspace.requestPending")}
      </p>
    );
  }
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-3 text-start">
      <label htmlFor="reason" className="text-[13px] font-medium text-ink">{t("workspace.requestReason")}</label>
      <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      <Button variant="primary" loading={busy} onClick={() => run(() => requestAccessAction({ matterId, reason }), { success: t("workspace.requestSent"), onSuccess: () => setSent(true) })}>
        <KeyRound /> {t("workspace.requestAccess")}
      </Button>
    </div>
  );
}

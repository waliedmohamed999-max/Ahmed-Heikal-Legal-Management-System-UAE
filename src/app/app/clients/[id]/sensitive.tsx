"use client";

import { useState } from "react";
import { Eye, ShieldAlert, Lock } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/forms";
import { revealSensitiveAction } from "../actions";

/** Sensitive identifiers are never sent to the browser until explicitly revealed (and audited). */
export function SensitiveReveal({ id, canView }: { id: string; canView: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<{ emiratesId: string | null; passportNo: string | null } | null>(null);
  const { run, pending } = useAction();
  return (
    <div>
      <p className="flex items-center gap-1.5 text-meta font-semibold text-ink"><ShieldAlert className="size-3.5 text-warning" /> {t("clients.sensitive")}</p>
      {!canView ? (
        <p className="mt-1.5 inline-flex items-center gap-1 text-meta text-ink-subtle"><Lock className="size-3" /> {t("clients.noPermission")}</p>
      ) : data ? (
        <dl className="mt-2 grid grid-cols-2 gap-2 text-body">
          <div><dt className="text-meta text-ink-subtle">{t("clients.fields.emiratesId")}</dt><dd className="ltr-nums font-mono">{data.emiratesId ?? "—"}</dd></div>
          <div><dt className="text-meta text-ink-subtle">{t("clients.fields.passportNo")}</dt><dd className="ltr-nums font-mono">{data.passportNo ?? "—"}</dd></div>
        </dl>
      ) : (
        <Button size="xs" variant="secondary" className="mt-2" loading={pending} onClick={() => run(() => revealSensitiveAction({ id }), { onSuccess: setData })}>
          <Eye /> {t("clients.reveal")}
        </Button>
      )}
      <p className="mt-1.5 text-meta text-ink-subtle">{t("clients.sensitiveHint")}</p>
    </div>
  );
}

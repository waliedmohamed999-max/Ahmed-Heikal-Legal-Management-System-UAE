"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { saveAiSettingsAction } from "../actions";

export function AiSettingsForm({ enabled, allowDocumentProcessing }: { enabled: boolean; allowDocumentProcessing: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState({ enabled, allowDocumentProcessing });
  const { run, pending } = useAction();
  return (
    <div className="space-y-3 border-t border-line p-4">
      <Checkbox label={t("settings.ai.enabled")} checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
      <div>
        <Checkbox label={t("settings.ai.documents")} checked={v.allowDocumentProcessing} disabled={!v.enabled} onChange={(e) => setV({ ...v, allowDocumentProcessing: e.target.checked })} />
        <p className="ms-6 mt-0.5 text-meta text-ink-subtle">{t("settings.ai.documentsHint")}</p>
      </div>
      <div className="flex justify-end"><Button variant="primary" loading={pending} onClick={() => run(() => saveAiSettingsAction(v), { success: t("settings.saved"), onSuccess: () => router.refresh() })}>{t("common.save")}</Button></div>
    </div>
  );
}

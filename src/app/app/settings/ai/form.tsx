"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { saveAiSettingsAction } from "../actions";

export function AiSettingsForm({ enabled, allowDocumentProcessing, maskIdentifiers, acknowledged }: { enabled: boolean; allowDocumentProcessing: boolean; maskIdentifiers: boolean; acknowledged: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState({ enabled, allowDocumentProcessing, maskIdentifiers, acknowledge: acknowledged });
  const { run, pending } = useAction();
  return (
    <div className="space-y-3 border-t border-line p-4">
      {!acknowledged && (
        <div className="rounded-md border border-warning/30 bg-warning-soft p-3">
          <Checkbox label={t("sec.aiAck")} checked={v.acknowledge} onChange={(e) => setV({ ...v, acknowledge: e.target.checked })} />
        </div>
      )}
      <Checkbox label={t("settings.ai.enabled")} checked={v.enabled} disabled={!v.acknowledge} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
      {!v.acknowledge && <p className="ms-6 text-meta text-ink-subtle">{t("sec.aiAckRequired")}</p>}
      <div>
        <Checkbox label={t("settings.ai.documents")} checked={v.allowDocumentProcessing} disabled={!v.enabled} onChange={(e) => setV({ ...v, allowDocumentProcessing: e.target.checked })} />
        <p className="ms-6 mt-0.5 text-meta text-ink-subtle">{t("settings.ai.documentsHint")}</p>
      </div>
      <Checkbox label={t("sec.aiMask")} checked={v.maskIdentifiers} onChange={(e) => setV({ ...v, maskIdentifiers: e.target.checked })} />
      <div className="flex justify-end">
        <Button variant="primary" loading={pending} onClick={() => run(() => saveAiSettingsAction(v), { success: t("settings.saved"), onSuccess: () => router.refresh() })}>{t("common.save")}</Button>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { Sparkles, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { aiStatus } from "@/server/services/ai/provider";
import { AiSettingsForm } from "./form";

export default async function AiSettingsPage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const { t } = await getT();
  const s = aiStatus(ctx);
  return (
    <div className="space-y-5">
      <Panel title={t("settings.ai.title")} icon={<Sparkles />}>
        <dl className="grid gap-3 p-4 text-body sm:grid-cols-3">
          <div><dt className="text-ink-subtle">{t("settings.ai.provider")}</dt><dd>{s.provider}</dd></div>
          <div><dt className="text-ink-subtle">{t("settings.ai.model")}</dt><dd className="font-mono" dir="ltr">{s.model}</dd></div>
          <div><dt className="text-ink-subtle">{t("settings.ai.status")}</dt><dd><Badge tone={s.keyConfigured ? "success" : "warning"}>{s.keyConfigured ? t("settings.ai.keyPresent") : t("settings.ai.keyMissing")}</Badge></dd></div>
        </dl>
        <AiSettingsForm enabled={s.enabled} allowDocumentProcessing={s.allowDocuments} />
      </Panel>
      <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2.5 text-meta text-info"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> {t("settings.ai.policy")}</p>
    </div>
  );
}

import { notFound } from "next/navigation";
import { Activity, DatabaseBackup } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { systemHealth, type HealthState } from "@/server/services/system-health";
import { Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, relativeTime } from "@/lib/time";

export const metadata = { title: "System health" };

const TONE: Record<HealthState, "success" | "warning" | "neutral" | "danger"> = { HEALTHY: "success", WARNING: "warning", NOT_CONFIGURED: "neutral", ERROR: "danger" };

export default async function SystemHealthPage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const { t, locale } = await getT();
  const h = await systemHealth(ctx);
  const when = (iso: string | null) => (iso ? formatDateTime(iso, locale, ctx.org.timezone) : t("sec.health.never"));
  return (
    <div className="space-y-5">
      <p className="text-body text-ink-muted">{t("sec.health.subtitle")}</p>
      <Panel title={t("sec.health.title")} icon={<Activity />} actions={<span className="text-meta text-ink-subtle">{t("sec.health.checkedAt", { when: relativeTime(h.checkedAt, locale) })}</span>}>
        <ul className="divide-y divide-line">
          {h.modules.map((m) => (
            <li key={m.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="w-48 shrink-0 text-body font-medium text-ink">{t(`sec.health.${m.key}`)}</span>
              <Badge tone={TONE[m.state]}>{t(`sec.health.${m.state}`)}</Badge>
              {m.detail && <span className="min-w-0 flex-1 text-meta text-ink-subtle" dir="auto">{m.detail}</span>}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t("sec.health.backups")} icon={<DatabaseBackup />}>
        <dl className="grid gap-3 p-4 text-body sm:grid-cols-3">
          <div><dt className="text-ink-subtle">{t("sec.health.lastBackup")}</dt><dd className={h.backups.lastDbOk ? "text-ink" : "text-danger"}>{when(h.backups.lastDb)}</dd></div>
          <div><dt className="text-ink-subtle">{t("sec.health.lastStorageBackup")}</dt><dd className="text-ink">{when(h.backups.lastStorage)}</dd></div>
          <div><dt className="text-ink-subtle">{t("sec.health.lastRestoreTest")}</dt><dd className={h.backups.lastRestoreOk ? "text-success" : "text-danger"}>{when(h.backups.lastRestoreTest)}</dd></div>
        </dl>
      </Panel>
    </div>
  );
}

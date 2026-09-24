import { notFound } from "next/navigation";
import { DatabaseBackup, History, LifeBuoy } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/time";
import { formatBytes } from "@/lib/utils";
import { RunBackup } from "./run";

export default async function BackupsPage() {
  const ctx = await requireStaff();
  if (!ctx.can("backups.view")) notFound();
  const { t, locale } = await getT();
  const rows = await db.backupRecord.findMany({ where: { organizationId: ctx.org.id }, orderBy: { startedAt: "desc" }, take: 30 });
  return (
    <div className="space-y-5">
      <p className="text-body text-ink-muted">{t("settings.backups.intro")}</p>
      <Panel title={t("settings.backups.strategy")} icon={<DatabaseBackup />} actions={ctx.can("settings.manage") && <RunBackup />}>
        <p className="p-4 text-body leading-relaxed text-ink">{t("settings.backups.strategyText")}</p>
      </Panel>
      <Panel title={t("settings.backups.history")} icon={<History />}>
        {rows.length === 0 ? <EmptyState compact title={t("settings.backups.none")} /> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-body">
                <Badge tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "info"}>{r.status}</Badge>
                <span>{r.kind}</span>
                <span className="text-meta text-ink-subtle">{formatDateTime(r.startedAt, locale, ctx.org.timezone)}</span>
                {r.sizeBytes != null && <span className="text-meta text-ink-subtle">{formatBytes(r.sizeBytes)}</span>}
                {r.checksum && <span className="ltr-nums font-mono text-caption text-ink-subtle">{r.checksum.slice(0, 16)}…</span>}
                {r.error && <span className="text-meta text-danger">{r.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t("settings.backups.restore")} icon={<LifeBuoy />}>
        <p className="p-4 text-body leading-relaxed text-ink">{t("settings.backups.restoreText")}</p>
      </Panel>
    </div>
  );
}

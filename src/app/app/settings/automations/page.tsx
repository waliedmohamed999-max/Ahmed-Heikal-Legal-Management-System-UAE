import { notFound } from "next/navigation";
import { Zap } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/time";
import { AutomationToggle } from "./toggle";

export default async function AutomationsPage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const { t, locale } = await getT();
  const autos = await db.automation.findMany({ where: { organizationId: ctx.org.id }, include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-5">
      <p className="text-body text-ink-muted">{t("settings.automations.subtitle")}</p>
      {autos.map((a) => {
        const actions = a.actions as { type: string; title?: string; titleAr?: string; to?: string; assignTo?: string; dueOffsetMinutes?: number }[];
        return (
          <Panel key={a.id} title={locale === "ar" ? a.nameAr || a.name : a.name} icon={<Zap />} actions={<AutomationToggle id={a.id} enabled={a.enabled} />}>
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div>
                <p className="text-meta font-semibold uppercase tracking-wide text-ink-subtle">{t("settings.automations.trigger")}</p>
                <p className="mt-1 text-body text-ink">{t(`settings.automations.triggers.${a.trigger}`)}</p>
                <p className="mt-3 text-meta font-semibold uppercase tracking-wide text-ink-subtle">{t("settings.automations.actions")}</p>
                <ul className="mt-1 space-y-1">
                  {actions.map((x, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-1.5 text-body">
                      <Badge tone="info">{t(`settings.automations.actionTypes.${x.type}`)}</Badge>
                      {(x.title || x.titleAr) && <span className="text-ink">{locale === "ar" ? x.titleAr || x.title : x.title}</span>}
                      {(x.assignTo || x.to) && <span className="font-mono text-meta text-ink-subtle" dir="ltr">→ {x.assignTo ?? x.to}</span>}
                      {x.dueOffsetMinutes != null && <span className="font-mono text-meta text-ink-subtle" dir="ltr">({x.dueOffsetMinutes > 0 ? "+" : ""}{Math.round(x.dueOffsetMinutes / 60)}h)</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-meta font-semibold uppercase tracking-wide text-ink-subtle">{t("settings.automations.runs")}</p>
                {a.runs.length === 0 ? <p className="mt-1 text-meta text-ink-subtle">—</p> : (
                  <ul className="mt-1 space-y-1">{a.runs.map((r) => <li key={r.id} className="flex items-center gap-2 text-meta"><Badge tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "neutral"}>{r.status}</Badge><span className="text-ink-subtle">{relativeTime(r.createdAt, locale)}</span></li>)}</ul>
                )}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

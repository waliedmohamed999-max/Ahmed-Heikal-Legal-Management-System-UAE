import { FileText, Activity, HeartPulse, Flag, Users, ListChecks, Globe, Info } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { matterHealth } from "@/server/services/health";
import { db } from "@/server/db";
import { Panel, Avatar, EmptyState } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PartiesPanel, ChecklistPanel } from "./overview-client";

export default async function CaseOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t, locale } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  const m = ws.matter;
  const caps = new Set(ws.caps);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;

  const [health, checklist, activity] = await Promise.all([
    matterHealth(id),
    db.matterChecklistItem.findMany({ where: { matterId: id }, orderBy: { order: "asc" } }),
    db.activity.findMany({ where: { matterId: id }, orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { name: true, nameAr: true } } } }),
  ]);
  const done = checklist.filter((c) => c.doneAt).length;

  const narrative = [
    ["workspace.currentStatus", m.currentStatusText],
    ["workspace.lastAction", m.lastActionText],
    ["workspace.nextAction", m.nextActionText],
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="flex flex-col gap-5 xl:col-span-8">
        <Panel title={t("workspace.summary")} icon={<FileText />}>
          <div className="px-4 py-4">
            {m.summary ? <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">{m.summary}</p> : <p className="text-[13px] text-ink-subtle">{t("common.notSet")}</p>}
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              {narrative.map(([k, v]) => (
                <div key={k} className="rounded-md border border-line bg-surface-muted/50 p-3">
                  <dt className="text-[11.5px] font-medium text-ink-subtle">{t(k)}</dt>
                  <dd className="mt-1 whitespace-pre-line text-[13px] text-ink">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {(m.claims || (caps.has("finance.view") && m.claimAmount != null)) && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-[12px] font-semibold text-ink-muted">{t("workspace.claims")}</h3>
                {m.claims && <p className="mt-1 whitespace-pre-line text-[13px] text-ink">{m.claims}</p>}
                {caps.has("finance.view") && m.claimAmount != null && <p className="ltr-nums mt-1 text-[13px] font-medium text-ink">{formatMoney(m.claimAmount, locale, m.currency)}</p>}
              </div>
            )}
            {m.internalNotes && (
              <div className="mt-5 rounded-md border border-dashed border-line-strong p-3">
                <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted"><Info className="size-3.5" /> {t("workspace.internalNotes")}</h3>
                <p className="mt-1 whitespace-pre-line text-[13px] text-ink">{m.internalNotes}</p>
              </div>
            )}
          </div>
        </Panel>

        <Panel title={t("workspace.parties")} icon={<Users />}>
          <PartiesPanel
            matterId={id}
            canEdit={caps.has("matters.edit")}
            client={{ id: m.client.id, name: L(m.client.nameEn, m.client.nameAr) }}
            parties={m.parties.map((p) => ({ id: p.id, role: p.role, name: L(p.contact.nameEn, p.contact.nameAr), contactId: p.contact.id, type: p.contact.type }))}
          />
        </Panel>

        <Panel
          title={t("workspace.checklist")}
          icon={<ListChecks />}
          actions={checklist.length > 0 && <span className="text-[12px] tabular text-ink-muted">{done}/{checklist.length}</span>}
        >
          {checklist.length > 0 && (
            <div className="h-1 bg-surface-sunken">
              <div className="h-full bg-success transition-all" style={{ width: `${(done / checklist.length) * 100}%` }} />
            </div>
          )}
          <ChecklistPanel
            key={checklist.map((c) => `${c.id}:${c.doneAt ? 1 : 0}`).join()}
            matterId={id}
            canEdit={caps.has("matters.edit")}
            items={checklist.map((c) => ({ id: c.id, title: L(c.title, c.titleAr), required: c.required, done: !!c.doneAt }))}
          />
        </Panel>
      </div>

      <div className="flex flex-col gap-5 xl:col-span-4">
        <Panel title={t("workspace.health")} icon={<HeartPulse />} footer={<p className="text-[11.5px] text-ink-subtle">{t("workspace.healthNote")}</p>}>
          <dl className="grid grid-cols-2">
            {health.map((h, i) => (
              <div key={h.key} className={cn("border-line px-4 py-3", i % 2 === 0 && "border-e", i < health.length - 2 && "border-b")}>
                <dt className="text-[11.5px] text-ink-subtle">{t(`workspace.indicators.${h.key}`)}</dt>
                <dd className={cn("mt-0.5 text-lg font-semibold tabular", h.tone === "danger" ? "text-danger" : h.tone === "warning" && h.value > 0 ? "text-warning" : "text-ink")}>{h.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {m.riskFlags.length > 0 && (
          <Panel title={t("workspace.riskFlags")} icon={<Flag />}>
            <ul className="flex flex-wrap gap-1.5 p-4">
              {m.riskFlags.map((f) => (
                <li key={f}><Badge tone="warning">{t(`enums.riskFlag.${f}`)}</Badge></li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title={t("workspace.portal")} icon={<Globe />}>
          <div className="space-y-2 px-4 py-3 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("workspace.portalEnabled")}</span>
              <Badge tone={m.portalEnabled ? "success" : "neutral"}>{m.portalEnabled ? t("common.yes") : t("common.no")}</Badge>
            </div>
            {m.portalEnabled && m.portalStatusText && <p className="rounded-md bg-surface-muted p-2.5 text-[12.5px] text-ink">{m.portalStatusText}</p>}
          </div>
        </Panel>

        <Panel title={t("dashboard.activity")} icon={<Activity />}>
          {activity.length ? (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5 text-[12.5px]">
                  <Avatar name={a.actor?.name ?? "System"} size={22} />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{a.actor ? L(a.actor.name, a.actor.nameAr) : "—"}</span>{" "}
                    <span className="text-ink-muted">{t(`activity.${a.type}`, a.data as Record<string, string>)}</span>
                    <div className="text-[11px] text-ink-subtle">{relativeTime(a.createdAt, locale)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={t("dashboard.activityEmpty")} />
          )}
        </Panel>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 text-[12.5px] shadow-xs">
          <div><dt className="text-ink-subtle">{t("workspace.opened")}</dt><dd className="text-ink">{formatDate(m.openedAt, locale, tz)}</dd></div>
          <div><dt className="text-ink-subtle">{t("common.owner")}</dt><dd className="text-ink">{L(m.owner.name, m.owner.nameAr)}</dd></div>
          <div><dt className="text-ink-subtle">{t("intake.steps.conflict")}</dt><dd className="text-ink">{t(`enums.conflictStatus.${m.conflictStatus}`)}</dd></div>
          <div><dt className="text-ink-subtle">{t("workspace.feeArrangement")}</dt><dd className="text-ink">{t(`enums.billingType.${m.billingType}`)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

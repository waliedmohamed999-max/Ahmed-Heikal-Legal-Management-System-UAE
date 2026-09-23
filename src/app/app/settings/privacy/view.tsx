"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, FileDown, Plus, Scale } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { useAction } from "@/components/forms";
import { formatDateTime } from "@/lib/time";
import { saveRetentionAction, privacyRequestAction, breachAction } from "../actions";

type Req = { id: string; kind: string; status: string; subjectId: string; subject: string; notes: string | null; createdAt: string };
type Breach = { id: string; detectedAt: string; description: string; severity: string; affectedData: string | null; actionsTaken: string | null; reportedToAuthorityAt: string | null };

export function PrivacyView({ retentionYears, requests, breaches }: { retentionYears: number; requests: Req[]; breaches: Breach[] }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [years, setYears] = useState(retentionYears);
  const [req, setReq] = useState<{ kind: "EXPORT" | "DELETION" | "RECTIFICATION"; subjectId: string | null; notes: string }>({ kind: "EXPORT", subjectId: null, notes: "" });
  const [br, setBr] = useState({ detectedAt: "", description: "", severity: "MEDIUM", affectedData: "", actionsTaken: "", reportedToAuthorityAt: "" });
  return (
    <div className="space-y-5">
      <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">{t("settings.privacy.intro")}</p>
      <Panel title={t("settings.privacy.retention")} icon={<Scale />}>
        <div className="flex items-end gap-3 p-4">
          <Field label={t("settings.privacy.retention")}>{(a) => <Input {...a} type="number" min={1} max={50} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-32" dir="ltr" />}</Field>
          <Button variant="primary" loading={pending} onClick={() => run(() => saveRetentionAction({ closedMatterYears: years }), { success: t("settings.saved") })}>{t("common.save")}</Button>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-ink-subtle">{t("settings.privacy.legalHold")}</p>
      </Panel>

      <Panel title={t("settings.privacy.requests")} icon={<FileDown />}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[180px_1fr_1fr_auto] sm:items-end">
          <Field label={t("settings.privacy.kind")}>{(a) => <Select {...a} value={req.kind} onChange={(e) => setReq({ ...req, kind: e.target.value as never })}>{["EXPORT", "DELETION", "RECTIFICATION"].map((k) => <option key={k} value={k}>{t(`settings.privacy.kinds.${k}`)}</option>)}</Select>}</Field>
          <Field label={t("settings.privacy.subject")}>{(a) => <Picker {...a} type="clients" value={req.subjectId} onChange={(i) => setReq({ ...req, subjectId: i?.id ?? null })} />}</Field>
          <Field label={t("common.notes")}>{(a) => <Input {...a} value={req.notes} onChange={(e) => setReq({ ...req, notes: e.target.value })} />}</Field>
          <Button variant="secondary" disabled={!req.subjectId} loading={pending} onClick={() => run(() => privacyRequestAction({ kind: req.kind, subjectId: req.subjectId!, notes: req.notes }), { success: t("settings.saved"), onSuccess: () => router.refresh() })}><Plus /> {t("settings.privacy.newRequest")}</Button>
        </div>
        {requests.length === 0 ? <EmptyState compact title="—" /> : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]">
                <Badge tone="info">{t(`settings.privacy.kinds.${r.kind}`)}</Badge>
                <span className="font-medium">{r.subject}</span>
                <span className="text-[12px] text-ink-subtle">{formatDateTime(r.createdAt, locale, tz)}</span>
                <Badge tone={r.status === "COMPLETED" ? "success" : r.status === "ON_LEGAL_HOLD" ? "warning" : "neutral"}>{t(`settings.privacy.statuses.${r.status}`)}</Badge>
                <div className="ms-auto flex gap-1">
                  {r.kind === "EXPORT" && <Button asChild size="xs" variant="ghost"><a href={`/api/privacy/export/${r.subjectId}`}><FileDown /> {t("settings.privacy.export")}</a></Button>}
                  {r.status === "OPEN" && <Button size="xs" variant="secondary" onClick={() => run(() => privacyRequestAction({ id: r.id, kind: r.kind as never, subjectId: r.subjectId, status: "COMPLETED" }), { onSuccess: () => router.refresh() })}>{t("settings.privacy.statuses.COMPLETED")}</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("settings.privacy.breaches")} icon={<ShieldAlert />}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2">
          <Field label={t("settings.privacy.detectedAt")}>{(a) => <Input {...a} type="datetime-local" value={br.detectedAt} onChange={(e) => setBr({ ...br, detectedAt: e.target.value })} />}</Field>
          <Field label={t("settings.privacy.severity")}>{(a) => <Select {...a} value={br.severity} onChange={(e) => setBr({ ...br, severity: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>}</Field>
          <Field label={t("common.description")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} value={br.description} onChange={(e) => setBr({ ...br, description: e.target.value })} />}</Field>
          <Field label={t("settings.privacy.affected")}>{(a) => <Input {...a} value={br.affectedData} onChange={(e) => setBr({ ...br, affectedData: e.target.value })} />}</Field>
          <Field label={t("settings.privacy.reportedAt")}>{(a) => <Input {...a} type="datetime-local" value={br.reportedToAuthorityAt} onChange={(e) => setBr({ ...br, reportedToAuthorityAt: e.target.value })} />}</Field>
          <Field label={t("settings.privacy.actions")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} value={br.actionsTaken} onChange={(e) => setBr({ ...br, actionsTaken: e.target.value })} />}</Field>
          <div className="flex justify-end sm:col-span-2"><Button variant="secondary" disabled={!br.detectedAt || !br.description} loading={pending} onClick={() => run(() => breachAction({ ...br, severity: br.severity as never }), { success: t("settings.saved"), onSuccess: () => router.refresh() })}><Plus /> {t("settings.privacy.newBreach")}</Button></div>
        </div>
        {breaches.length === 0 ? <EmptyState compact title="—" /> : (
          <ul className="divide-y divide-line">
            {breaches.map((b) => (
              <li key={b.id} className="px-4 py-2.5 text-[13px]">
                <div className="flex items-center gap-2"><Badge tone={b.severity === "CRITICAL" || b.severity === "HIGH" ? "danger" : "warning"}>{b.severity}</Badge><span className="text-[12px] text-ink-subtle">{formatDateTime(b.detectedAt, locale, tz)}</span></div>
                <p className="mt-1 text-ink">{b.description}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Gauge, Info } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge, ALERT_TONE } from "@/components/ui/badge";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { formatOffsets, parseOffsets } from "@/lib/admin-schemas";
import { saveRemindersAction } from "../actions";

type Level = "IMMEDIATE" | "CRITICAL" | "HIGH" | "PRIORITY" | "REMINDER";
type Channel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";
type Policy = { subjectType: "HEARING" | "DEADLINE" | "APPOINTMENT" | "TASK"; offsetsMinutes: number[]; channels: Channel[]; notifyOwner: boolean; escalateBeforeMinutes: number | null; enabled: boolean };

export function RemindersForm({ thresholds, policies, channels }: { thresholds: { level: Level; minutes: number }[]; policies: Policy[]; channels: Record<Channel, boolean> }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [th, setTh] = useState(thresholds.map((x) => ({ ...x, text: formatOffsets([x.minutes]) })));
  const [ps, setPs] = useState(policies.map((p) => ({ ...p, text: formatOffsets(p.offsetsMinutes), esc: p.escalateBeforeMinutes ? formatOffsets([p.escalateBeforeMinutes]) : "" })));
  const save = () =>
    run(() => saveRemindersAction({
      thresholds: th.map((x) => ({ level: x.level, minutes: parseOffsets(x.text)[0] ?? x.minutes })),
      policies: ps.map((p) => ({ subjectType: p.subjectType, offsetsMinutes: parseOffsets(p.text), channels: p.channels, notifyOwner: p.notifyOwner, escalateBeforeMinutes: p.esc ? parseOffsets(p.esc)[0] ?? null : null, enabled: p.enabled })),
    }), { onSuccess: (d) => { router.refresh(); toast.success(t("settings.reminders.resynced", { n: (d as { resynced: number }).resynced })); } });

  return (
    <div className="space-y-5">
      <Panel title={t("settings.reminders.thresholds")} icon={<Gauge />}>
        <div className="space-y-3 p-4">
          <p className="text-meta text-ink-muted">{t("settings.reminders.thresholdsHint")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {th.map((x, i) => (
              <div key={x.level}>
                <Badge tone={ALERT_TONE[x.level]} className="mb-1.5">{t(`enums.alertLevel.${x.level}`)}</Badge>
                <Input value={x.text} dir="ltr" className="font-mono" aria-label={t(`enums.alertLevel.${x.level}`)} onChange={(e) => setTh(th.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} />
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title={t("settings.reminders.policies")} icon={<Bell />} footer={<p className="flex items-start gap-1.5 text-meta text-ink-subtle"><Info className="mt-0.5 size-3.5 shrink-0" /> {t("settings.reminders.channelNote")}</p>}>
        <div className="divide-y divide-line">
          {ps.map((p, i) => {
            const set = (patch: Partial<typeof p>) => setPs(ps.map((y, j) => (j === i ? { ...y, ...patch } : y)));
            return (
              <div key={p.subjectType} className="grid gap-3 p-4 lg:grid-cols-[160px_1fr_1fr]">
                <div>
                  <p className="text-body font-semibold text-ink">{t(`settings.reminders.types.${p.subjectType}`)}</p>
                  <Checkbox className="mt-1.5" label={t("settings.reminders.enabled")} checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                </div>
                <div className="space-y-3">
                  <Field label={t("settings.reminders.offsets")} hint={t("settings.reminders.offsetsHint")}>{(a) => <Input {...a} dir="ltr" className="font-mono" value={p.text} onChange={(e) => set({ text: e.target.value })} />}</Field>
                  <Field label={t("settings.reminders.escalate")}>{(a) => <Input {...a} dir="ltr" className="font-mono" placeholder="1d" value={p.esc} onChange={(e) => set({ esc: e.target.value })} />}</Field>
                </div>
                <div>
                  <p className="mb-1.5 text-body font-medium">{t("settings.reminders.channels")}</p>
                  <div className="space-y-1">
                    {(["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"] as Channel[]).map((c) => (
                      <label key={c} className="flex items-center gap-2 text-body">
                        <input type="checkbox" disabled={c === "IN_APP"} checked={p.channels.includes(c) || c === "IN_APP"} className="accent-[var(--accent)]"
                          onChange={(e) => set({ channels: e.target.checked ? [...p.channels, c] : p.channels.filter((x) => x !== c) })} />
                        {c.replace("_", " ")}
                        {!channels[c] && <Badge tone="outline">{t("common.notConnected")}</Badge>}
                      </label>
                    ))}
                  </div>
                  <Checkbox className="mt-2" label={t("settings.reminders.notifyOwner")} checked={p.notifyOwner} onChange={(e) => set({ notifyOwner: e.target.checked })} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <div className="flex justify-end"><Button variant="primary" loading={pending} onClick={save}>{t("common.save")}</Button></div>
    </div>
  );
}

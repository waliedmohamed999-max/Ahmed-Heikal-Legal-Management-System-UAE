"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, ShieldAlert, Check, X, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge, ALERT_TONE } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input } from "@/components/ui/form";
import { CountdownInline, useNow } from "@/components/countdown";
import { useAction } from "@/components/forms";
import { DeadlineDialog } from "@/components/quick/forms";
import { EventTypeChip } from "@/components/events";
import { alertLevel, type AlertThreshold } from "@/lib/deadline";
import { formatDateTime, toZonedLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { deadlineStatusAction, verifyDeadlineAction } from "@/app/app/event-actions";

export type DeadlineRow = {
  id: string; type: string; title: string; description: string | null; dueAt: string; isCritical: boolean; status: string; verification: string; source: string;
  assignee: { id: string; name: string } | null; verifiedBy: string | null; matter: { id: string; label: string } | null;
};

const EVENT_OF: Record<string, string> = {
  SUBMISSION: "SUBMISSION", DOCUMENT: "SUBMISSION", APPEAL: "COURT_DEADLINE", COURT_APPOINTMENT: "COURT_DEADLINE", PAYMENT: "PAYMENT", EXPERT_MEETING: "EXPERT_MEETING",
  FOLLOW_UP: "FOLLOW_UP", RENEWAL: "FOLLOW_UP", INTERNAL: "TASK_DEADLINE", OTHER: "FOLLOW_UP",
};

export function DeadlinesView({ matterId, matterLabel, rows, thresholds, canManage, canVerify }: {
  matterId?: string; matterLabel?: string; rows: DeadlineRow[]; thresholds: AlertThreshold[]; canManage: boolean; canVerify: boolean;
}) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const now = useNow();
  const [edit, setEdit] = useState<DeadlineRow | "new" | null>(null);
  const [verify, setVerify] = useState<DeadlineRow | null>(null);
  const { run, pending } = useAction();
  const open = rows.filter((r) => r.status === "OPEN");
  const closed = rows.filter((r) => r.status !== "OPEN");

  return (
    <div className="space-y-5">
      <Panel title={t("deadlines.title")} icon={<CalendarClock />} actions={canManage && <Button size="sm" variant="secondary" onClick={() => setEdit("new")}><Plus /> {t("deadlines.new")}</Button>}>
        {open.length === 0 ? (
          <EmptyState icon={<CalendarClock />} title={t("deadlines.empty")} body={t("deadlines.emptyBody")} action={canManage && <Button size="sm" variant="primary" onClick={() => setEdit("new")}><Plus /> {t("deadlines.new")}</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {open.map((d) => {
              const level = alertLevel(new Date(d.dueAt), new Date(now), thresholds);
              return (
                <li key={d.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", d.verification === "NEEDS_VERIFICATION" && "bg-warning-soft/40")}>
                  <Badge tone={ALERT_TONE[level]} className="w-24 justify-center">{t(`enums.alertLevel.${level}`)}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium text-ink">{d.title}</span>
                      {d.isCritical && <Badge tone="critical">{t("enums.priority.CRITICAL")}</Badge>}
                      {d.verification === "NEEDS_VERIFICATION" ? (
                        <Badge tone="warning"><ShieldAlert /> {t("enums.verification.NEEDS_VERIFICATION")}</Badge>
                      ) : d.source !== "MANUAL" && <Badge tone="success"><ShieldCheck /> {t("enums.verification.CONFIRMED")}</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-muted">
                      <EventTypeChip type={EVENT_OF[d.type] ?? "FOLLOW_UP"} />
                      <span>· {t(`enums.deadlineType.${d.type}`)}</span>
                      <span>· {formatDateTime(d.dueAt, locale, tz)}</span>
                      {d.assignee && <span>· {d.assignee.name}</span>}
                      <span>· {t("deadlines.source")}: {t(`enums.eventSource.${d.source}`)}</span>
                      {d.matter && <Link href={`/app/cases/${d.matter.id}/deadlines`} className="text-accent hover:underline">· {d.matter.label}</Link>}
                    </div>
                  </div>
                  <CountdownInline target={d.dueAt} thresholds={thresholds} className="text-[13px]" />
                  <div className="flex gap-1">
                    {d.verification === "NEEDS_VERIFICATION" && canVerify && <Button size="xs" variant="primary" onClick={() => setVerify(d)}><ShieldCheck /> {t("deadlines.verify")}</Button>}
                    {canManage && (
                      <>
                        <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEdit(d)}><Pencil /></Button>
                        <Button size="icon-xs" variant="ghost" aria-label={t("deadlines.markDone")} loading={pending} onClick={() => run(() => deadlineStatusAction({ id: d.id, status: "DONE" }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() })}><Check /></Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {closed.length > 0 && (
        <Panel title={t("deadlines.history")}>
          <ul className="divide-y divide-line">
            {closed.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Badge tone={d.status === "DONE" ? "success" : "outline"}>{t(`enums.deadlineStatus.${d.status}`)}</Badge>
                <span className={cn("flex-1 truncate", d.status === "CANCELLED" && "line-through text-ink-subtle")}>{d.title}</span>
                <span className="text-[12px] text-ink-subtle">{formatDateTime(d.dueAt, locale, tz)}</span>
                {canManage && <Button size="icon-xs" variant="ghost" aria-label={t("deadlines.reopen")} onClick={() => run(() => deadlineStatusAction({ id: d.id, status: "OPEN" }), { onSuccess: () => router.refresh() })}><RotateCcw /></Button>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DeadlineDialog
            matterId={matterId}
            labels={{ matter: matterLabel ?? (edit !== "new" ? edit.matter?.label : null), user: edit !== "new" ? edit.assignee?.name : null }}
            initial={edit === "new" ? undefined : { id: edit.id, matterId: matterId ?? edit.matter?.id ?? "", type: edit.type as never, title: edit.title, description: edit.description ?? "", dueAt: toZonedLocalInput(edit.dueAt, tz), isCritical: edit.isCritical, assigneeId: edit.assignee?.id ?? "" }}
            onDone={() => setEdit(null)}
          />
        )}
      </Dialog>
      <Dialog open={!!verify} onOpenChange={(o) => !o && setVerify(null)}>
        {verify && <VerifyDialog d={verify} onDone={() => { setVerify(null); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

function VerifyDialog({ d, onDone }: { d: DeadlineRow; onDone: () => void }) {
  const { t, tz } = useI18n();
  const [date, setDate] = useState(toZonedLocalInput(d.dueAt, tz));
  const { run, pending } = useAction();
  return (
    <DialogContent title={t("deadlines.verifyTitle")} description={d.title}>
      <p className="mb-4 rounded-md bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">{t("deadlines.verifyIntro")}</p>
      <Field label={t("deadlines.confirmDate")}>{(a) => <Input {...a} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <DialogFooter>
        <Button variant="ghost" loading={pending} onClick={() => run(() => verifyDeadlineAction({ id: d.id, approve: false }), { success: t("approvals.decided"), onSuccess: onDone })}><X /> {t("deadlines.rejectIt")}</Button>
        <Button variant="primary" loading={pending} onClick={() => run(() => verifyDeadlineAction({ id: d.id, approve: true, dueAt: date }), { success: t("approvals.decided"), onSuccess: onDone })}><Check /> {t("deadlines.confirm")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

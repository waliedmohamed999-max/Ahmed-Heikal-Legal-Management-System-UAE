"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, ShieldAlert, Check, X, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge, ALERT_TONE, StatusText } from "@/components/ui/badge";
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
          <div role="table" className="text-body">
            <div role="row" className="hidden grid-cols-[minmax(0,1fr)_150px_110px_130px_140px_auto] items-center gap-3 border-b border-line px-4 py-1.5 text-meta text-ink-subtle lg:grid">
              <span role="columnheader">{t("deadlines.title")}</span>
              <span role="columnheader">{t("home.due")}</span>
              <span role="columnheader">{t("home.remaining")}</span>
              <span role="columnheader">{t("home.owner")}</span>
              <span role="columnheader">{t("shell.verification")}</span>
              <span role="columnheader" className="sr-only">{t("common.actions")}</span>
            </div>
            {open.map((d) => {
              const level = alertLevel(new Date(d.dueAt), new Date(now), thresholds);
              const hot = level === "OVERDUE" || level === "IMMEDIATE" || level === "CRITICAL" || d.isCritical;
              return (
                <div role="row" key={d.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line/70 px-4 py-2.5 last:border-0 lg:grid-cols-[minmax(0,1fr)_150px_110px_130px_140px_auto]", hot && "bg-danger-soft/35")}>
                  <div role="cell" className="min-w-0">
                    <div className="bidi-plain truncate font-medium text-ink">{d.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-meta text-ink-muted">
                      <EventTypeChip type={EVENT_OF[d.type] ?? "FOLLOW_UP"} />
                      <StatusText tone={ALERT_TONE[level]} className="text-meta">{t(`enums.alertLevel.${level}`)}</StatusText>
                      <span className="text-ink-subtle">· {t(`enums.eventSource.${d.source}`)}</span>
                      {d.matter && <Link href={`/app/cases/${d.matter.id}/deadlines`} className="bidi-plain truncate text-ink-muted hover:text-ink hover:underline">· {d.matter.label}</Link>}
                    </div>
                  </div>
                  <div role="cell" className="hidden whitespace-nowrap tabular text-ink-muted lg:block">{formatDateTime(d.dueAt, locale, tz)}</div>
                  <div role="cell" className="whitespace-nowrap"><CountdownInline target={d.dueAt} thresholds={thresholds} /></div>
                  <div role="cell" className="hidden truncate text-ink-muted lg:block">{d.assignee?.name ?? "—"}</div>
                  <div role="cell" className="hidden lg:block">
                    {d.verification === "NEEDS_VERIFICATION" ? (
                      <StatusText tone="warning">{t("enums.verification.NEEDS_VERIFICATION")}</StatusText>
                    ) : (
                      <StatusText tone={d.source === "MANUAL" ? "neutral" : "success"}>{t("enums.verification.CONFIRMED")}</StatusText>
                    )}
                  </div>
                  <div role="cell" className="col-span-2 flex justify-end gap-1 lg:col-span-1">
                    {d.verification === "NEEDS_VERIFICATION" && canVerify && <Button size="xs" variant="primary" onClick={() => setVerify(d)}><ShieldCheck /> {t("deadlines.verify")}</Button>}
                    {canManage && (
                      <>
                        <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEdit(d)}><Pencil /></Button>
                        <Button size="icon-xs" variant="ghost" aria-label={t("deadlines.markDone")} loading={pending} onClick={() => run(() => deadlineStatusAction({ id: d.id, status: "DONE" }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() })}><Check /></Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {closed.length > 0 && (
        <Panel title={t("deadlines.history")}>
          <ul className="divide-y divide-line">
            {closed.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-body">
                <Badge tone={d.status === "DONE" ? "success" : "outline"}>{t(`enums.deadlineStatus.${d.status}`)}</Badge>
                <span className={cn("flex-1 truncate", d.status === "CANCELLED" && "line-through text-ink-subtle")}>{d.title}</span>
                <span className="text-meta text-ink-subtle">{formatDateTime(d.dueAt, locale, tz)}</span>
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
      <p className="mb-4 rounded-md bg-warning-soft px-3 py-2.5 text-meta text-warning">{t("deadlines.verifyIntro")}</p>
      <Field label={t("deadlines.confirmDate")}>{(a) => <Input {...a} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <DialogFooter>
        <Button variant="ghost" loading={pending} onClick={() => run(() => verifyDeadlineAction({ id: d.id, approve: false }), { success: t("approvals.decided"), onSuccess: onDone })}><X /> {t("deadlines.rejectIt")}</Button>
        <Button variant="primary" loading={pending} onClick={() => run(() => verifyDeadlineAction({ id: d.id, approve: true, dueAt: date }), { success: t("approvals.decided"), onSuccess: onDone })}><Check /> {t("deadlines.confirm")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

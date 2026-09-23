"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as D } from "radix-ui";
import { CheckSquare, Circle, CheckCircle2, Lock, MessageSquare, ListChecks, Pencil, Trash2, Play, Pause, Send, Plus } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge, PRIORITY_TONE, TASK_STATUS_TONE } from "@/components/ui/badge";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/layout";
import { Dialog, SheetContent } from "@/components/ui/overlay";
import { Input, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { TaskDialog } from "@/components/quick/forms";
import { formatDate, formatDateTime, formatTime, relativeTime, toZonedLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { taskStatusAction, taskChecklistAction, addTaskChecklistAction, deleteTaskAction } from "@/app/app/event-actions";
import { addCommentAction } from "@/app/app/collab-actions";

export type TaskRow = {
  id: string; title: string; status: string; priority: string; dueAt: string | null; completedAt: string | null; overdue: boolean; blocked: boolean;
  matter: { id: string; internalNumber: string; title: string; titleAr: string | null } | null;
  assignee: { id: string; name: string; nameAr: string | null; photoUrl: string | null } | null;
  checklist: { total: number; done: number }; comments: number;
};

export function TaskList({ rows, emptyTitle, emptyAction, showMatter = true }: { rows: TaskRow[]; emptyTitle?: string; emptyAction?: React.ReactNode; showMatter?: boolean }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(sp.get("task"));
  const { run } = useAction();
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  useEffect(() => setOpenId(sp.get("task")), [sp]);

  const toggle = (r: TaskRow) => run(() => taskStatusAction({ id: r.id, status: r.status === "DONE" ? "TODO" : "DONE" }), { onSuccess: () => router.refresh() });

  if (!rows.length) return <EmptyState icon={<CheckSquare />} title={emptyTitle ?? t("tasks.empty")} action={emptyAction} />;
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted/50">
            <button type="button" onClick={() => toggle(r)} disabled={r.blocked && r.status !== "DONE"} aria-label={r.status === "DONE" ? t("common.reopen") : t("common.markDone")}
              className="shrink-0 text-ink-subtle hover:text-success disabled:cursor-not-allowed disabled:opacity-50">
              {r.status === "DONE" ? <CheckCircle2 className="size-[18px] text-success" /> : r.blocked ? <Lock className="size-4" /> : <Circle className="size-[18px]" />}
            </button>
            <button type="button" onClick={() => setOpenId(r.id)} className="min-w-0 flex-1 text-start">
              <div className="flex items-center gap-2">
                <span className={cn("truncate text-[13.5px] text-ink", r.status === "DONE" && "text-ink-subtle line-through")}>{r.title}</span>
                {r.status !== "TODO" && r.status !== "DONE" && <Badge tone={TASK_STATUS_TONE[r.status]}>{t(`enums.taskStatus.${r.status}`)}</Badge>}
                {r.blocked && r.status !== "DONE" && <Badge tone="outline"><Lock /> {t("tasks.blocked")}</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-subtle">
                {showMatter && r.matter && <span className="truncate"><span className="ltr-nums font-mono">{r.matter.internalNumber}</span> · {L(r.matter.title, r.matter.titleAr)}</span>}
                {r.checklist.total > 0 && <span className="inline-flex items-center gap-0.5"><ListChecks className="size-3" /> {r.checklist.done}/{r.checklist.total}</span>}
                {r.comments > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" /> {r.comments}</span>}
              </div>
            </button>
            <Badge tone={PRIORITY_TONE[r.priority]} className="hidden sm:inline-flex">{t(`enums.priority.${r.priority}`)}</Badge>
            {r.dueAt && (
              <span className={cn("hidden w-28 shrink-0 text-end text-[12px] tabular sm:block", r.overdue ? "font-medium text-danger" : "text-ink-muted")}>
                {formatDate(r.dueAt, locale, tz, { day: "numeric", month: "short", year: undefined })} {formatTime(r.dueAt, locale, tz)}
              </span>
            )}
            {r.assignee && <Avatar name={L(r.assignee.name, r.assignee.nameAr)} src={r.assignee.photoUrl} size={24} />}
          </li>
        ))}
      </ul>
      <D.Root open={!!openId} onOpenChange={(o) => { if (!o) { setOpenId(null); const u = new URL(window.location.href); u.searchParams.delete("task"); window.history.replaceState(null, "", u); } }}>
        {openId && <TaskSheet id={openId} onChanged={() => router.refresh()} onClose={() => setOpenId(null)} />}
      </D.Root>
    </>
  );
}

type Detail = {
  id: string; title: string; description: string | null; status: string; priority: string; dueAt: string | null; startAt: string | null; estimateMinutes: number | null; createdAt: string; sourceType: string | null;
  matter: { id: string; internalNumber: string; title: string; titleAr: string | null } | null; assignee: { id: string; name: string; nameAr: string | null; photoUrl: string | null } | null;
  createdBy: { name: string; nameAr: string | null } | null; checklist: { id: string; title: string; done: boolean }[]; dependsOn: { id: string; title: string; status: string }[];
  comments: { id: string; body: string; createdAt: string; author: { name: string; nameAr: string | null; photoUrl: string | null } }[];
};

function TaskSheet({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const { t, locale, tz } = useI18n();
  const qc = useQueryClient();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const q = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const r = await fetch(`/api/tasks/${id}`);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as Detail;
    },
  });
  const reload = () => { qc.invalidateQueries({ queryKey: ["task", id] }); onChanged(); };
  const d = q.data;
  const setStatus = (status: "TODO" | "IN_PROGRESS" | "WAITING" | "DONE") => run(() => taskStatusAction({ id, status }), { success: t("common.changesSaved"), onSuccess: reload });

  return (
    <SheetContent title={d?.title ?? t("tasks.detail")} className="max-w-lg"
      headerActions={d && <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEditing(true)}><Pencil /></Button>}>
      {q.isLoading ? (
        <div className="space-y-3 p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-20" /><Skeleton className="h-32" /></div>
      ) : q.isError || !d ? (
        <EmptyState title={t("errors.notFound")} action={<Button size="sm" onClick={() => q.refetch()}>{t("common.retry")}</Button>} />
      ) : (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={TASK_STATUS_TONE[d.status]}>{t(`enums.taskStatus.${d.status}`)}</Badge>
            <Badge tone={PRIORITY_TONE[d.priority]}>{t(`enums.priority.${d.priority}`)}</Badge>
            {d.sourceType && <Badge tone="outline">{d.sourceType.startsWith("AUTOMATION") ? t("enums.eventSource.AUTOMATION") : t("enums.eventSource.HEARING_REPORT")}</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <div><dt className="text-[11.5px] text-ink-subtle">{t("tasks.fields.assignee")}</dt><dd>{d.assignee ? L(d.assignee.name, d.assignee.nameAr) : t("common.unassigned")}</dd></div>
            <div><dt className="text-[11.5px] text-ink-subtle">{t("tasks.fields.dueAt")}</dt><dd>{d.dueAt ? formatDateTime(d.dueAt, locale, tz) : "—"}</dd></div>
            <div className="col-span-2"><dt className="text-[11.5px] text-ink-subtle">{t("tasks.fields.matter")}</dt><dd>{d.matter ? <Link href={`/app/cases/${d.matter.id}`} onClick={onClose} className="text-accent hover:underline"><span className="ltr-nums font-mono">{d.matter.internalNumber}</span> · {L(d.matter.title, d.matter.titleAr)}</Link> : t("tasks.noMatter")}</dd></div>
            <div><dt className="text-[11.5px] text-ink-subtle">{t("tasks.createdBy")}</dt><dd>{d.createdBy ? L(d.createdBy.name, d.createdBy.nameAr) : "—"} · {relativeTime(d.createdAt, locale)}</dd></div>
            {d.estimateMinutes != null && <div><dt className="text-[11.5px] text-ink-subtle">{t("tasks.fields.estimate")}</dt><dd className="tabular">{d.estimateMinutes}</dd></div>}
          </dl>
          {d.description && <p className="whitespace-pre-line rounded-md bg-surface-muted p-3 text-[13px] text-ink">{d.description}</p>}
          <div className="flex flex-wrap gap-2">
            {d.status !== "IN_PROGRESS" && d.status !== "DONE" && <Button size="sm" variant="secondary" loading={pending} onClick={() => setStatus("IN_PROGRESS")}><Play /> {t("tasks.start")}</Button>}
            {d.status !== "WAITING" && d.status !== "DONE" && <Button size="sm" variant="secondary" loading={pending} onClick={() => setStatus("WAITING")}><Pause /> {t("tasks.waitingOn")}</Button>}
            {d.status !== "DONE" ? <Button size="sm" variant="primary" loading={pending} onClick={() => setStatus("DONE")}><CheckCircle2 /> {t("tasks.complete")}</Button> : <Button size="sm" variant="secondary" onClick={() => setStatus("TODO")}>{t("common.reopen")}</Button>}
          </div>
          {d.dependsOn.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-muted">{t("tasks.fields.dependencies")}</p>
              <ul className="space-y-1">{d.dependsOn.map((x) => <li key={x.id} className="flex items-center gap-2 text-[13px]"><Badge tone={TASK_STATUS_TONE[x.status]}>{t(`enums.taskStatus.${x.status}`)}</Badge> {x.title}</li>)}</ul>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-muted">{t("tasks.fields.checklist")}</p>
            <ul className="space-y-0.5">
              {d.checklist.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-surface-muted">
                    <input type="checkbox" checked={c.done} onChange={(e) => run(() => taskChecklistAction({ id: c.id, done: e.target.checked }), { onSuccess: reload })} className="accent-[var(--success)]" />
                    <span className={cn(c.done && "text-ink-subtle line-through")}>{c.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (item.trim()) run(() => addTaskChecklistAction({ taskId: id, title: item }), { onSuccess: () => { setItem(""); reload(); } }); }}>
              <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t("tasks.checklistItemPlaceholder")} className="h-8" aria-label={t("tasks.checklistAdd")} />
              <Button type="submit" size="sm" variant="secondary" disabled={!item.trim()}><Plus /></Button>
            </form>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink-muted">{t("tasks.comments")}</p>
            <ul className="space-y-3">
              {d.comments.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <Avatar name={c.author.name} src={c.author.photoUrl} size={22} />
                  <div className="min-w-0 text-[13px]"><span className="font-medium">{L(c.author.name, c.author.nameAr)}</span> <span className="text-[11.5px] text-ink-subtle">{relativeTime(c.createdAt, locale)}</span><p className="whitespace-pre-line text-ink">{c.body}</p></div>
                </li>
              ))}
            </ul>
            <form className="mt-2 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) run(() => addCommentAction({ taskId: id, body: comment }), { onSuccess: () => { setComment(""); reload(); } }); }}>
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("workspace.commentPlaceholder")} aria-label={t("tasks.comments")} />
              <Button type="submit" size="icon" variant="primary" disabled={!comment.trim()} aria-label={t("common.submit")}><Send className="rtl:-scale-x-100" /></Button>
            </form>
          </div>
          <div className="border-t border-line pt-3">
            <Button size="sm" variant="danger-ghost" onClick={() => run(() => deleteTaskAction({ id }), { success: t("common.changesSaved"), onSuccess: () => { onChanged(); onClose(); } })}><Trash2 /> {t("tasks.delete")}</Button>
          </div>
        </div>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && d && (
          <TaskDialog
            labels={{ matter: d.matter ? `${d.matter.internalNumber} · ${L(d.matter.title, d.matter.titleAr)}` : null, user: d.assignee ? L(d.assignee.name, d.assignee.nameAr) : null }}
            initial={{ id: d.id, matterId: d.matter?.id ?? "", title: d.title, description: d.description ?? "", assigneeId: d.assignee?.id ?? "", priority: d.priority as never, status: d.status as never, startAt: toZonedLocalInput(d.startAt, tz), dueAt: toZonedLocalInput(d.dueAt, tz), estimateMinutes: d.estimateMinutes ?? "" }}
            onDone={() => { setEditing(false); reload(); }}
          />
        )}
      </Dialog>
    </SheetContent>
  );
}

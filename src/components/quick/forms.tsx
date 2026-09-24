"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { z } from "zod";
import { useI18n } from "@/i18n/client";
import { DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/picker";
import { useServerForm } from "@/components/forms";
import { appointmentSchema, deadlineSchema, hearingSchema, noteSchema, taskSchema, APPOINTMENT_TYPES, DEADLINE_TYPES, PRIORITIES } from "@/lib/schemas";
import { toZonedLocalInput } from "@/lib/time";
import { saveAppointmentAction, saveDeadlineAction, saveHearingAction, saveTaskAction } from "@/app/app/event-actions";
import { createNoteAction } from "@/app/app/collab-actions";

type Done = () => void;
/** Labels for pickers when editing (so the button shows the current value). */
export type Labels = { matter?: string | null; user?: string | null; court?: string | null; client?: string | null };

function defaultStart(tz: string, hoursFromNow = 24) {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  d.setMinutes(0, 0, 0);
  return toZonedLocalInput(d, tz);
}

function useDone(onDone: Done) {
  const router = useRouter();
  return () => {
    router.refresh();
    onDone();
  };
}

// ─────────────────────────── Hearing ───────────────────────────
export function HearingDialog({ matterId, initial, labels, onDone }: { matterId?: string; initial?: Partial<z.input<typeof hearingSchema>>; labels?: Labels; onDone: Done }) {
  const { t, tz } = useI18n();
  const done = useDone(onDone);
  const { form, submit, pending, err } = useServerForm({
    schema: hearingSchema,
    defaultValues: {
      id: "", matterId: matterId ?? "", courtId: "", courtRoom: "", isRemote: false, remoteUrl: "", startsAt: defaultStart(tz, 72), endsAt: "", judge: "", sessionType: "",
      attendingLawyerId: "", clientAttendance: "NOT_REQUIRED", requiredDocuments: "", preparationNotes: "", ...initial,
    },
    action: saveHearingAction,
    successMessage: initial?.id ? t("hearings.rescheduled") : t("hearings.created"),
    onSuccess: done,
  });
  const r = form.register;
  const remote = form.watch("isRemote");
  return (
    <DialogContent title={initial?.id ? t("hearings.edit") : t("hearings.new")} size="lg">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("tasks.fields.matter")} error={err("matterId")} required className="sm:col-span-2">
          {(a) => <Picker {...a} type="matters" value={form.watch("matterId")} initialLabel={labels?.matter} disabled={!!initial?.id || !!matterId} invalid={!!err("matterId")}
            onChange={(i) => form.setValue("matterId", i?.id ?? "", { shouldValidate: true })} placeholder={t("quickForms.selectCase")} />}
        </Field>
        <Field label={t("hearings.startsAt")} error={err("startsAt")} required>{(a) => <Input {...a} type="datetime-local" {...r("startsAt")} />}</Field>
        <Field label={t("hearings.endsAt")} error={err("endsAt")}>{(a) => <Input {...a} type="datetime-local" {...r("endsAt")} />}</Field>
        <Field label={t("hearings.sessionType")}>{(a) => <Input {...a} {...r("sessionType")} />}</Field>
        <Field label={t("hearings.court")}>
          {(a) => <Picker {...a} type="courts" value={form.watch("courtId")} initialLabel={labels?.court} onChange={(i) => form.setValue("courtId", i?.id ?? "")} placeholder={t("quickForms.selectCourt")} />}
        </Field>
        <Checkbox label={t("hearings.remote")} {...r("isRemote")} className="sm:col-span-2" />
        {remote ? (
          <Field label={t("hearings.remoteUrl")} error={err("remoteUrl")} className="sm:col-span-2">{(a) => <Input {...a} type="url" dir="ltr" {...r("remoteUrl")} />}</Field>
        ) : (
          <Field label={t("hearings.room")}>{(a) => <Input {...a} {...r("courtRoom")} />}</Field>
        )}
        <Field label={t("hearings.judge")}>{(a) => <Input {...a} {...r("judge")} />}</Field>
        <Field label={t("hearings.lawyer")}>
          {(a) => <Picker {...a} type="users" value={form.watch("attendingLawyerId")} initialLabel={labels?.user} onChange={(i) => form.setValue("attendingLawyerId", i?.id ?? "")} placeholder={t("quickForms.selectPerson")} />}
        </Field>
        <Field label={t("hearings.clientAttendance")}>{(a) => <Select {...a} {...r("clientAttendance")}>{["REQUIRED", "OPTIONAL", "NOT_REQUIRED"].map((v) => <option key={v} value={v}>{t(`enums.attendance.${v}`)}</option>)}</Select>}</Field>
        {initial?.id && (
          <Field label={t("common.status")}>{(a) => <Select {...a} {...r("status")}>{["SCHEDULED", "PREPARING", "READY", "CANCELLED"].map((v) => <option key={v} value={v}>{t(`enums.hearingStatus.${v}`)}</option>)}</Select>}</Field>
        )}
        <Field label={t("hearings.requiredDocuments")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} {...r("requiredDocuments")} />}</Field>
        <Field label={t("hearings.preparationNotes")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={3} {...r("preparationNotes")} />}</Field>
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─────────────────────────── Deadline ───────────────────────────
export function DeadlineDialog({ matterId, initial, labels, onDone }: { matterId?: string; initial?: Partial<z.input<typeof deadlineSchema>>; labels?: Labels; onDone: Done }) {
  const { t, tz } = useI18n();
  const done = useDone(onDone);
  const { form, submit, pending, err } = useServerForm({
    schema: deadlineSchema,
    defaultValues: { id: "", matterId: matterId ?? "", type: "SUBMISSION", title: "", description: "", dueAt: defaultStart(tz, 72), isCritical: false, assigneeId: "", ...initial },
    action: saveDeadlineAction,
    successMessage: t("deadlines.saved"),
    onSuccess: done,
  });
  const r = form.register;
  return (
    <DialogContent title={initial?.id ? t("deadlines.edit") : t("deadlines.new")}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("tasks.fields.matter")} className="sm:col-span-2">
          {(a) => <Picker {...a} type="matters" value={form.watch("matterId")} initialLabel={labels?.matter} disabled={!!initial?.id || !!matterId} onChange={(i) => form.setValue("matterId", i?.id ?? "")} placeholder={t("quickForms.selectCase")} />}
        </Field>
        <Field label={t("deadlines.fields.title")} error={err("title")} required className="sm:col-span-2">{(a) => <Input {...a} {...r("title")} />}</Field>
        <Field label={t("deadlines.fields.type")}>{(a) => <Select {...a} {...r("type")}>{DEADLINE_TYPES.map((v) => <option key={v} value={v}>{t(`enums.deadlineType.${v}`)}</option>)}</Select>}</Field>
        <Field label={t("deadlines.fields.dueAt")} error={err("dueAt")} required>{(a) => <Input {...a} type="datetime-local" {...r("dueAt")} />}</Field>
        <Field label={t("deadlines.fields.assignee")} className="sm:col-span-2">
          {(a) => <Picker {...a} type="users" value={form.watch("assigneeId")} initialLabel={labels?.user} onChange={(i) => form.setValue("assigneeId", i?.id ?? "")} placeholder={t("quickForms.selectPerson")} />}
        </Field>
        <Checkbox label={t("deadlines.fields.critical")} {...r("isCritical")} className="sm:col-span-2" />
        <Field label={t("deadlines.fields.notes")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} {...r("description")} />}</Field>
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─────────────────────────── Appointment ───────────────────────────
export function AppointmentDialog({ matterId, initial, labels, onDone }: { matterId?: string; initial?: Partial<z.input<typeof appointmentSchema>>; labels?: Labels; onDone: Done }) {
  const { t, tz } = useI18n();
  const done = useDone(onDone);
  const { form, submit, pending, err } = useServerForm({
    schema: appointmentSchema,
    defaultValues: {
      id: "", type: "CONSULTATION", title: "", startsAt: defaultStart(tz, 24), durationMinutes: 60, lawyerId: "", clientId: "", matterId: matterId ?? "", leadId: "",
      location: "", meetingUrl: "", notes: "", portalVisible: false, ...initial,
    },
    action: saveAppointmentAction,
    successMessage: t("appointments.saved"),
    onSuccess: done,
  });
  const r = form.register;
  return (
    <DialogContent title={initial?.id ? t("appointments.edit") : t("appointments.new")} size="lg">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("appointments.fields.title")} error={err("title")} required className="sm:col-span-2">{(a) => <Input {...a} {...r("title")} />}</Field>
        <Field label={t("appointments.fields.type")}>{(a) => <Select {...a} {...r("type")}>{APPOINTMENT_TYPES.map((v) => <option key={v} value={v}>{t(`enums.appointmentType.${v}`)}</option>)}</Select>}</Field>
        <Field label={t("appointments.fields.startsAt")} error={err("startsAt")} required>{(a) => <Input {...a} type="datetime-local" {...r("startsAt")} />}</Field>
        <Field label={t("appointments.fields.duration")} error={err("durationMinutes")}>{(a) => <Input {...a} type="number" min={5} step={5} dir="ltr" {...r("durationMinutes")} />}</Field>
        <Field label={t("appointments.fields.lawyer")}>
          {(a) => <Picker {...a} type="users" value={form.watch("lawyerId")} initialLabel={labels?.user} onChange={(i) => form.setValue("lawyerId", i?.id ?? "")} placeholder={t("quickForms.selectPerson")} />}
        </Field>
        <Field label={t("appointments.fields.client")}>
          {(a) => <Picker {...a} type="clients" value={form.watch("clientId")} initialLabel={labels?.client} onChange={(i) => form.setValue("clientId", i?.id ?? "")} placeholder={t("quickForms.selectClient")} />}
        </Field>
        <Field label={t("appointments.fields.matter")}>
          {(a) => <Picker {...a} type="matters" value={form.watch("matterId")} initialLabel={labels?.matter} disabled={!!matterId} onChange={(i) => { form.setValue("matterId", i?.id ?? ""); }} placeholder={t("quickForms.selectCase")} />}
        </Field>
        <Field label={t("appointments.fields.location")}>{(a) => <Input {...a} {...r("location")} />}</Field>
        <Field label={t("appointments.fields.meetingUrl")} error={err("meetingUrl")}>{(a) => <Input {...a} type="url" dir="ltr" {...r("meetingUrl")} />}</Field>
        <Field label={t("appointments.fields.notes")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} {...r("notes")} />}</Field>
        <Checkbox label={t("appointments.fields.portalVisible")} {...r("portalVisible")} className="sm:col-span-2" />
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─────────────────────────── Task ───────────────────────────
export function TaskDialog({ matterId, initial, labels, onDone }: { matterId?: string; initial?: Partial<z.input<typeof taskSchema>>; labels?: Labels; onDone: Done }) {
  const { t, tz } = useI18n();
  const done = useDone(onDone);
  const [item, setItem] = useState("");
  const { form, submit, pending, err } = useServerForm({
    schema: taskSchema,
    defaultValues: {
      id: "", matterId: matterId ?? "", title: "", description: "", assigneeId: "", priority: "NORMAL", status: "TODO", startAt: "", dueAt: defaultStart(tz, 24),
      estimateMinutes: "", checklist: [], ...initial,
    },
    action: saveTaskAction,
    successMessage: t("tasks.saved"),
    onSuccess: done,
  });
  const r = form.register;
  const checklist = form.watch("checklist") ?? [];
  return (
    <DialogContent title={initial?.id ? t("tasks.edit") : t("tasks.new")} size="lg">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("tasks.fields.title")} error={err("title")} required className="sm:col-span-2">{(a) => <Input {...a} {...r("title")} />}</Field>
        <Field label={t("tasks.fields.matter")}>
          {(a) => <Picker {...a} type="matters" value={form.watch("matterId")} initialLabel={labels?.matter} disabled={!!matterId} onChange={(i) => form.setValue("matterId", i?.id ?? "")} placeholder={t("tasks.noMatter")} />}
        </Field>
        <Field label={t("tasks.fields.assignee")}>
          {(a) => <Picker {...a} type="users" value={form.watch("assigneeId")} initialLabel={labels?.user} onChange={(i) => form.setValue("assigneeId", i?.id ?? "")} placeholder={t("quickForms.selectPerson")} />}
        </Field>
        <Field label={t("tasks.fields.priority")}>{(a) => <Select {...a} {...r("priority")}>{PRIORITIES.map((v) => <option key={v} value={v}>{t(`enums.priority.${v}`)}</option>)}</Select>}</Field>
        <Field label={t("tasks.fields.status")}>{(a) => <Select {...a} {...r("status")}>{["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"].map((v) => <option key={v} value={v}>{t(`enums.taskStatus.${v}`)}</option>)}</Select>}</Field>
        <Field label={t("tasks.fields.startAt")}>{(a) => <Input {...a} type="datetime-local" {...r("startAt")} />}</Field>
        <Field label={t("tasks.fields.dueAt")} error={err("dueAt")}>{(a) => <Input {...a} type="datetime-local" {...r("dueAt")} />}</Field>
        <Field label={t("tasks.fields.estimate")} error={err("estimateMinutes")}>{(a) => <Input {...a} type="number" min={0} step={15} dir="ltr" {...r("estimateMinutes")} />}</Field>
        <Field label={t("tasks.fields.description")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={3} {...r("description")} />}</Field>
        {!initial?.id && (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-body font-medium">{t("tasks.fields.checklist")}</p>
            <ul className="mb-2 space-y-1">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-center gap-2 rounded bg-surface-muted px-2 py-1 text-body">
                  <span className="flex-1">{c}</span>
                  <button type="button" aria-label={t("common.remove")} onClick={() => form.setValue("checklist", checklist.filter((_, j) => j !== i))}><X className="size-3.5 text-ink-subtle" /></button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t("tasks.checklistItemPlaceholder")} aria-label={t("tasks.checklistAdd")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (item.trim()) { form.setValue("checklist", [...checklist, item.trim()]); setItem(""); } } }} />
              <Button type="button" variant="secondary" onClick={() => { if (item.trim()) { form.setValue("checklist", [...checklist, item.trim()]); setItem(""); } }}><Plus /></Button>
            </div>
          </div>
        )}
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─────────────────────────── Note ───────────────────────────
export function NoteDialog({ matterId, onDone }: { matterId?: string; onDone: Done }) {
  const { t } = useI18n();
  const done = useDone(onDone);
  const { form, submit, pending, err } = useServerForm({
    schema: noteSchema,
    defaultValues: { matterId: matterId ?? "", body: "", visibility: "TEAM", confirmClientVisible: false, pinned: false },
    action: createNoteAction,
    successMessage: t("common.changesSaved"),
    onSuccess: done,
  });
  const vis = form.watch("visibility");
  return (
    <DialogContent title={t("quick.newNote")}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label={t("quickForms.noteCase")} error={err("matterId")} required>
          {(a) => <Picker {...a} type="matters" value={form.watch("matterId")} disabled={!!matterId} invalid={!!err("matterId")} onChange={(i) => form.setValue("matterId", i?.id ?? "", { shouldValidate: true })} placeholder={t("quickForms.selectCase")} />}
        </Field>
        <Field label={t("common.type")}>{(a) => <Select {...a} {...form.register("visibility")}>{["TEAM", "PRIVATE", "CLIENT"].map((v) => <option key={v} value={v}>{t(`enums.noteVisibility.${v}`)}</option>)}</Select>}</Field>
        <Field label={t("common.notes")} error={err("body")} required>{(a) => <Textarea {...a} rows={5} {...form.register("body")} />}</Field>
        {vis === "CLIENT" && <Checkbox label={<span className="text-warning">{t("workspace.confirmClient")}</span>} {...form.register("confirmClientVisible")} />}
        <DialogFooter><Button type="submit" variant="primary" loading={pending} disabled={vis === "CLIENT" && !form.watch("confirmClientVisible")}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

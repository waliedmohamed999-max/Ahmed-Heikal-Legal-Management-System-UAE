"use client";

import { useFieldArray } from "react-hook-form";
import { Plus, Trash2, Info } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/picker";
import { useServerForm } from "@/components/forms";
import { hearingReportSchema, DEADLINE_TYPES } from "@/lib/schemas";
import { formatDateTime } from "@/lib/time";
import { hearingReportAction } from "@/app/app/event-actions";

/** Post-hearing report — saving creates next hearing, deadline, tasks, reminders and notifications. */
export function HearingReportDialog({ hearing, onDone }: { hearing: { id: string; title: string; startsAt: string }; onDone: () => void }) {
  const { t, locale, tz } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: hearingReportSchema,
    defaultValues: { hearingId: hearing.id, outcome: "", decisions: "", requiredActions: "", adjourned: true, nextHearingAt: "", nextSessionType: "", deadlineAt: "", deadlineTitle: "", deadlineType: "SUBMISSION", responsibleId: "", tasks: [] },
    action: hearingReportAction,
    successMessage: t("hearings.reported"),
    onSuccess: onDone,
  });
  const tasks = useFieldArray({ control: form.control, name: "tasks" });
  const r = form.register;
  return (
    <DialogContent title={t("hearings.report")} description={`${hearing.title} — ${formatDateTime(hearing.startsAt, locale, tz)}`} size="lg">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-meta text-info"><Info className="mt-0.5 size-4 shrink-0" /> {t("hearings.reportIntro")}</p>
        <Field label={t("hearings.outcome")} error={err("outcome")} required>{(a) => <Textarea {...a} rows={3} {...r("outcome")} />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("hearings.decisions")}>{(a) => <Textarea {...a} rows={3} {...r("decisions")} />}</Field>
          <Field label={t("hearings.requiredActions")}>{(a) => <Textarea {...a} rows={3} {...r("requiredActions")} />}</Field>
        </div>
        <fieldset className="grid gap-4 rounded-md border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-meta font-semibold text-ink-muted">{t("hearings.next")}</legend>
          <Field label={t("hearings.nextHearingAt")} error={err("nextHearingAt")}>{(a) => <Input {...a} type="datetime-local" {...r("nextHearingAt")} />}</Field>
          <Field label={t("hearings.sessionType")}>{(a) => <Input {...a} {...r("nextSessionType")} />}</Field>
          <Checkbox label={t("enums.hearingStatus.ADJOURNED")} {...r("adjourned")} />
        </fieldset>
        <fieldset className="grid gap-4 rounded-md border border-line p-3 sm:grid-cols-3">
          <legend className="px-1 text-meta font-semibold text-ink-muted">{t("hearings.nextDeadline")}</legend>
          <Field label={t("hearings.nextDeadlineTitle")}>{(a) => <Input {...a} {...r("deadlineTitle")} />}</Field>
          <Field label={t("deadlines.fields.type")}>{(a) => <Select {...a} {...r("deadlineType")}>{DEADLINE_TYPES.map((v) => <option key={v} value={v}>{t(`enums.deadlineType.${v}`)}</option>)}</Select>}</Field>
          <Field label={t("deadlines.fields.dueAt")} error={err("deadlineAt")}>{(a) => <Input {...a} type="datetime-local" {...r("deadlineAt")} />}</Field>
        </fieldset>
        <Field label={t("hearings.responsible")}>
          {(a) => <Picker {...a} type="users" value={form.watch("responsibleId")} onChange={(i) => form.setValue("responsibleId", i?.id ?? "")} placeholder={t("quickForms.selectPerson")} />}
        </Field>
        <div>
          <p className="mb-2 text-body font-medium">{t("hearings.followUpTasks")}</p>
          <div className="space-y-2">
            {tasks.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px_auto]">
                <Input placeholder={t("hearings.taskTitle")} aria-label={t("hearings.taskTitle")} {...r(`tasks.${i}.title`)} aria-invalid={!!err(`tasks.${i}.title`) || undefined} />
                <Input type="datetime-local" aria-label={t("tasks.fields.dueAt")} {...r(`tasks.${i}.dueAt`)} />
                <Button type="button" variant="danger-ghost" size="icon" onClick={() => tasks.remove(i)} aria-label={t("common.remove")}><Trash2 /></Button>
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => tasks.append({ title: "", assigneeId: "", dueAt: "" })}><Plus /> {t("hearings.addTask")}</Button>
        </div>
        <DialogFooter><Button type="submit" variant="primary" loading={pending}>{t("hearings.reportCta")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

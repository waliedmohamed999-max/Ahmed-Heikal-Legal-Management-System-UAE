"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useServerForm } from "@/components/forms";
import { matterUpdateSchema, MATTER_KINDS, MATTER_STATUSES, PRIORITIES, CONFIDENTIALITY, BILLING, RISK_FLAGS } from "@/lib/schemas";
import { updateCaseAction } from "../../actions";
import type { z } from "zod";

type Opt = { value: string; label: string; group?: string };

export function EditCaseForm({
  initial,
  options,
  caps,
}: {
  initial: z.input<typeof matterUpdateSchema>;
  options: { caseTypes: Opt[]; jurisdictions: Opt[]; courts: Opt[]; stages: Opt[]; staff: Opt[] };
  caps: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { form, submit, pending, err } = useServerForm({
    schema: matterUpdateSchema,
    defaultValues: initial,
    action: updateCaseAction,
    successMessage: t("common.changesSaved"),
    onSuccess: () => router.push(`/app/cases/${initial.id}`),
  });
  const { register, watch } = form;
  const jurisdictionId = watch("jurisdictionId");
  const courts = options.courts.filter((c) => !jurisdictionId || c.group === jurisdictionId);
  const canFinance = caps.includes("finance.manage");
  const canConf = caps.includes("matters.manageMembers");
  const canClose = caps.includes("matters.close");
  const flags = new Set(watch("riskFlags") ?? []);

  const sel = (name: keyof z.input<typeof matterUpdateSchema>, label: string, opts: Opt[], extra?: { disabled?: boolean; empty?: boolean }) => (
    <Field label={label} error={err(name)}>
      {(a) => (
        <Select {...a} {...register(name)} disabled={extra?.disabled}>
          {extra?.empty !== false && <option value="">{t("common.notSet")}</option>}
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )}
    </Field>
  );

  return (
    <form onSubmit={submit} className="divide-y divide-line" noValidate>
      <fieldset className="grid gap-4 p-5 md:grid-cols-2">
        <Field label={t("intake.caseTitle")} error={err("title")} required>
          {(a) => <Input {...a} {...register("title")} dir="ltr" />}
        </Field>
        <Field label={t("intake.caseTitleAr")} error={err("titleAr")}>
          {(a) => <Input {...a} {...register("titleAr")} dir="rtl" />}
        </Field>
        <Field label={t("intake.officialNumber")} hint={t("intake.officialNumberHint")} error={err("officialCaseNumber")}>
          {(a) => <Input {...a} {...register("officialCaseNumber")} dir="ltr" className="font-mono" />}
        </Field>
        {sel("kind", t("intake.kind"), MATTER_KINDS.map((k) => ({ value: k, label: t(`enums.matterKind.${k}`) })), { empty: false })}
        {sel("status", t("common.status"), MATTER_STATUSES.filter((s) => canClose || !["CLOSED", "ARCHIVED"].includes(s) || s === initial.status).map((k) => ({ value: k, label: t(`enums.matterStatus.${k}`) })), { empty: false })}
        {sel("priority", t("common.priority"), PRIORITIES.map((k) => ({ value: k, label: t(`enums.priority.${k}`) })), { empty: false })}
        {sel("confidentiality", t("intake.confidentiality"), CONFIDENTIALITY.map((k) => ({ value: k, label: t(`enums.confidentiality.${k}`) })), { empty: false, disabled: !canConf })}
        {sel("leadLawyerId", t("intake.lead"), options.staff)}
      </fieldset>

      <fieldset className="grid gap-4 p-5 md:grid-cols-2">
        {sel("caseTypeId", t("intake.caseType"), options.caseTypes)}
        {sel("jurisdictionId", t("intake.jurisdiction"), options.jurisdictions)}
        {sel("courtId", t("intake.court"), courts)}
        {sel("stageId", t("workspace.stage"), options.stages)}
      </fieldset>

      <fieldset className="grid gap-4 p-5">
        <Field label={t("intake.summary")} error={err("summary")}>{(a) => <Textarea {...a} rows={5} {...register("summary")} />}</Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("workspace.currentStatus")}>{(a) => <Textarea {...a} rows={3} {...register("currentStatusText")} />}</Field>
          <Field label={t("workspace.lastAction")}>{(a) => <Textarea {...a} rows={3} {...register("lastActionText")} />}</Field>
          <Field label={t("workspace.nextAction")}>{(a) => <Textarea {...a} rows={3} {...register("nextActionText")} />}</Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("intake.claims")}>{(a) => <Textarea {...a} rows={3} {...register("claims")} />}</Field>
          <Field label={t("intake.claimAmount")} error={err("claimAmount")}>{(a) => <Input {...a} type="number" step="0.01" min="0" dir="ltr" {...register("claimAmount")} />}</Field>
        </div>
        <Field label={t("workspace.internalNotes")}>{(a) => <Textarea {...a} rows={3} {...register("internalNotes")} />}</Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">{t("workspace.riskFlags")}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {RISK_FLAGS.map((f) => (
              <Checkbox
                key={f}
                label={t(`enums.riskFlag.${f}`)}
                checked={flags.has(f)}
                onChange={(e) => {
                  const next = new Set(flags);
                  if (e.target.checked) next.add(f);
                  else next.delete(f);
                  form.setValue("riskFlags", [...next] as never, { shouldDirty: true });
                }}
              />
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 p-5 md:grid-cols-2" disabled={!canFinance}>
        <legend className="sr-only">{t("workspace.feeArrangement")}</legend>
        {sel("billingType", t("intake.fees"), BILLING.map((k) => ({ value: k, label: t(`enums.billingType.${k}`) })), { empty: false, disabled: !canFinance })}
        <Field label={t("intake.feeAmount")} error={err("feeAmount")}>{(a) => <Input {...a} type="number" step="0.01" min="0" dir="ltr" {...register("feeAmount")} />}</Field>
        <Field label={t("intake.hourlyRate")} error={err("hourlyRate")}>{(a) => <Input {...a} type="number" step="0.01" min="0" dir="ltr" {...register("hourlyRate")} />}</Field>
        <Field label={t("intake.feeNotes")}>{(a) => <Input {...a} {...register("feeNotes")} />}</Field>
      </fieldset>

      <fieldset className="grid gap-4 p-5">
        <Checkbox label={t("workspace.portalEnabled")} {...register("portalEnabled")} />
        <Field label={t("workspace.portalStatus")}>{(a) => <Textarea {...a} rows={2} {...register("portalStatusText")} />}</Field>
      </fieldset>

      <div className="flex items-center justify-end gap-2 bg-surface-muted/50 px-5 py-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}

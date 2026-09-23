"use client";

import type { z } from "zod";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/layout";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useServerForm } from "@/components/forms";
import { officeSchema } from "@/lib/admin-schemas";
import { saveOfficeAction } from "../actions";

export function OfficeForm({ initial, tz, currency }: { initial: z.input<typeof officeSchema>; tz: string; currency: string }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({ schema: officeSchema, defaultValues: initial, action: saveOfficeAction, successMessage: t("settings.saved") });
  const r = form.register;
  return (
    <Panel title={t("settings.office.title")}>
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2" noValidate>
        <Field label={t("settings.office.name")} error={err("name")} required>{(a) => <Input {...a} dir="ltr" {...r("name")} />}</Field>
        <Field label={t("settings.office.nameAr")}>{(a) => <Input {...a} dir="rtl" {...r("nameAr")} />}</Field>
        <Field label={t("settings.office.trn")}>{(a) => <Input {...a} dir="ltr" {...r("trn")} />}</Field>
        <Field label={t("settings.office.vatRate")} error={err("vatRate")}>{(a) => <Input {...a} type="number" step="0.01" dir="ltr" {...r("vatRate")} />}</Field>
        <Field label={t("settings.office.phone")}>{(a) => <Input {...a} dir="ltr" {...r("phone")} />}</Field>
        <Field label={t("settings.office.email")} error={err("email")}>{(a) => <Input {...a} type="email" dir="ltr" {...r("email")} />}</Field>
        <Field label={t("settings.office.address")} className="sm:col-span-2">{(a) => <Input {...a} {...r("address")} />}</Field>
        <Field label={t("settings.office.matterPrefix")} error={err("matterPrefix")} hint="AH → AH-2026-00001">{(a) => <Input {...a} dir="ltr" className="font-mono uppercase" {...r("matterPrefix")} />}</Field>
        <Field label={t("settings.office.invoicePrefix")} error={err("invoicePrefix")}>{(a) => <Input {...a} dir="ltr" className="font-mono uppercase" {...r("invoicePrefix")} />}</Field>
        <Field label={t("settings.office.timezone")} hint={t("settings.office.fixed")}>{(a) => <Input {...a} value={tz} disabled dir="ltr" />}</Field>
        <Field label={t("settings.office.currency")} hint={t("settings.office.fixed")}>{(a) => <Input {...a} value={currency} disabled dir="ltr" />}</Field>
        <Checkbox className="sm:col-span-2" label={t("settings.office.hijri")} {...r("hijri")} />
        <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></div>
      </form>
    </Panel>
  );
}

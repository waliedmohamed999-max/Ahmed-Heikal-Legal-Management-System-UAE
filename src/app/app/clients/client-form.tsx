"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useServerForm } from "@/components/forms";
import { clientSchema, type ClientInput } from "@/lib/schemas";
import { createClientAction, updateClientAction } from "./actions";

const SOURCES = ["WEBSITE", "REFERRAL", "PHONE", "WALK_IN", "SOCIAL", "EXISTING_CLIENT", "OTHER"];

export function ClientForm({ id, initial, canSensitive, hasSensitive }: { id?: string; initial?: Partial<ClientInput>; canSensitive: boolean; hasSensitive?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { form, submit, pending, err } = useServerForm({
    schema: clientSchema,
    defaultValues: {
      type: "COMPANY", nameEn: "", nameAr: "", email: "", phone: "", whatsapp: "", address: "", nationality: "", preferredLanguage: "ar",
      tradeLicenseNo: "", companyName: "", emiratesId: "", passportNo: "", source: "", notes: "", status: "ACTIVE", ...initial,
    },
    action: (v) => (id ? updateClientAction({ ...v, id }) : createClientAction(v)),
    successMessage: id ? t("clients.saved") : t("clients.created"),
    onSuccess: (d) => router.push(`/app/clients/${(d as { id: string }).id}`),
  });
  const r = form.register;
  const type = form.watch("type");
  return (
    <form onSubmit={submit} className="divide-y divide-line" noValidate>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t("clients.fields.type")}>{(a) => <Select {...a} {...r("type")}><option value="COMPANY">{t("enums.partyType.COMPANY")}</option><option value="INDIVIDUAL">{t("enums.partyType.INDIVIDUAL")}</option></Select>}</Field>
        <Field label={t("clients.fields.status")}>{(a) => <Select {...a} {...r("status")}>{["ACTIVE", "INACTIVE", "PROSPECT"].map((s) => <option key={s} value={s}>{t(`enums.clientStatus.${s}`)}</option>)}</Select>}</Field>
        <Field label={t("clients.fields.nameEn")} error={err("nameEn")} required>{(a) => <Input {...a} dir="ltr" {...r("nameEn")} />}</Field>
        <Field label={t("clients.fields.nameAr")}>{(a) => <Input {...a} dir="rtl" {...r("nameAr")} />}</Field>
        <Field label={t("clients.fields.email")} error={err("email")}>{(a) => <Input {...a} type="email" dir="ltr" {...r("email")} />}</Field>
        <Field label={t("clients.fields.phone")}>{(a) => <Input {...a} type="tel" dir="ltr" {...r("phone")} />}</Field>
        <Field label={t("clients.fields.whatsapp")}>{(a) => <Input {...a} type="tel" dir="ltr" {...r("whatsapp")} />}</Field>
        <Field label={t("clients.fields.preferredLanguage")}>{(a) => <Select {...a} {...r("preferredLanguage")}><option value="ar">{t("clients.langAr")}</option><option value="en">{t("clients.langEn")}</option></Select>}</Field>
        {type === "COMPANY" ? (
          <Field label={t("clients.fields.tradeLicenseNo")}>{(a) => <Input {...a} dir="ltr" {...r("tradeLicenseNo")} />}</Field>
        ) : (
          <Field label={t("clients.fields.nationality")}>{(a) => <Input {...a} {...r("nationality")} />}</Field>
        )}
        <Field label={t("clients.fields.source")}>{(a) => <Select {...a} {...r("source")}><option value="">{t("common.notSet")}</option>{SOURCES.map((s) => <option key={s} value={s}>{t(`clients.sources.${s}`)}</option>)}</Select>}</Field>
        <Field label={t("clients.fields.address")} className="sm:col-span-2">{(a) => <Input {...a} {...r("address")} />}</Field>
        <Field label={t("clients.fields.notes")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={3} {...r("notes")} />}</Field>
      </div>

      {canSensitive && (
        <div className="p-5">
          <p className="flex items-center gap-1.5 text-body font-semibold text-ink"><ShieldAlert className="size-4 text-warning" /> {t("clients.sensitive")}</p>
          <p className="mb-3 mt-0.5 text-meta text-ink-subtle">{t("clients.sensitiveHint")}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("clients.fields.emiratesId")} hint={hasSensitive ? t("clients.keepExisting") : undefined}>{(a) => <Input {...a} dir="ltr" autoComplete="off" {...r("emiratesId")} />}</Field>
            <Field label={t("clients.fields.passportNo")} hint={hasSensitive ? t("clients.keepExisting") : undefined}>{(a) => <Input {...a} dir="ltr" autoComplete="off" {...r("passportNo")} />}</Field>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 bg-surface-muted/50 px-5 py-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}

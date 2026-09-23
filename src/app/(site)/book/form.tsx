"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Video, Building2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useServerForm } from "@/components/forms";
import { bookingSchema } from "@/lib/crm-schemas";
import { cn } from "@/lib/utils";
import { isoDateInDays } from "@/lib/time";
import { bookAction } from "./actions";

type Slots = { slotMinutes: number; days: number[]; startHour: number; endHour: number };

/** Next 21 bookable days (office weekdays, Dubai time) and the configured time slots. */
function bookableDays(s: Slots) {
  const out: string[] = [];
  for (let i = 1; out.length < 21 && i < 60; i++) {
    const iso = isoDateInDays(i, "Asia/Dubai");
    const dow = new Date(`${iso}T12:00:00+04:00`).getUTCDay();
    if (s.days.includes(dow)) out.push(iso);
  }
  return out;
}

export function BookingForm({ services, slots, preset }: { services: { id: string; label: string }[]; slots: Slots; preset: string }) {
  const { t, locale } = useI18n();
  const [done, setDone] = useState(false);
  // Computed once per visit (lazy state) so the list does not shift between renders.
  const [days] = useState(() => bookableDays(slots));
  const times = useMemo(() => {
    const out: string[] = [];
    for (let m = slots.startHour * 60; m + slots.slotMinutes <= slots.endHour * 60; m += slots.slotMinutes) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    return out;
  }, [slots]);
  const { form, submit, pending, err } = useServerForm({
    schema: bookingSchema,
    defaultValues: { practiceAreaId: preset, date: days[0] ?? "", time: times[0] ?? "10:00", mode: "OFFICE", name: "", phone: "", email: "", description: "", consent: false as never, website: "" },
    action: bookAction,
    onSuccess: () => setDone(true),
  });
  const r = form.register;
  const w = form.watch();
  const fmtDay = (iso: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Dubai" }).format(new Date(`${iso}T12:00:00+04:00`));

  if (done) {
    return (
      <div className="mt-8 flex flex-col items-center rounded-lg border border-success/30 bg-success-soft p-10 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <p className="mt-3 text-[16px] font-medium text-ink">{t("site.success")}</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-8 grid grid-cols-1 gap-5" noValidate>
      <Field label={t("site.service")}>{(a) => <Select {...a} {...r("practiceAreaId")}><option value="">{t("site.serviceGeneral")}</option>{services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}</Field>
      <div>
        <p className="mb-2 text-[13px] font-medium">{t("site.date")}</p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="radiogroup" aria-label={t("site.date")}>
          {days.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={w.date === d} onClick={() => form.setValue("date", d)}
              className={cn("shrink-0 rounded-md border px-3 py-2 text-[13px]", w.date === d ? "border-[#0e1b33] bg-[#0e1b33] text-white" : "border-line-strong hover:bg-surface-muted")}>{fmtDay(d)}</button>
          ))}
        </div>
        {err("date") && <p className="mt-1 text-xs text-danger">{err("date")}</p>}
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium">{t("site.time")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("site.time")}>
          {times.map((tm) => (
            <button key={tm} type="button" role="radio" aria-checked={w.time === tm} onClick={() => form.setValue("time", tm)}
              className={cn("ltr-nums rounded-md border px-3 py-1.5 text-[13px] tabular", w.time === tm ? "border-[#0e1b33] bg-[#0e1b33] text-white" : "border-line-strong hover:bg-surface-muted")}>{tm}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium">{t("site.mode")}</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("site.mode")}>
          {(["OFFICE", "ONLINE"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={w.mode === m} onClick={() => form.setValue("mode", m)}
              className={cn("flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-[14px]", w.mode === m ? "border-[#0e1b33] bg-[#0e1b33]/5 font-medium" : "border-line-strong")}>
              {m === "OFFICE" ? <Building2 className="size-4" /> : <Video className="size-4" />} {t(`site.modes.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("site.name")} error={err("name")} required className="sm:col-span-2">{(a) => <Input {...a} autoComplete="name" {...r("name")} />}</Field>
        <Field label={t("site.phone")} error={err("phone")} required>{(a) => <Input {...a} type="tel" autoComplete="tel" dir="ltr" {...r("phone")} />}</Field>
        <Field label={t("site.email")} error={err("email")} required>{(a) => <Input {...a} type="email" autoComplete="email" dir="ltr" {...r("email")} />}</Field>
      </div>
      <Field label={t("site.description")} hint={t("site.descriptionHint")}>{(a) => <Textarea {...a} rows={4} {...r("description")} />}</Field>
      {/* Honeypot: hidden from people, tempting for bots */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -start-[9999px] h-0 w-0 opacity-0" {...r("website")} />
      <div>
        <Checkbox label={t("site.consent")} {...r("consent")} />
        {err("consent") && <p className="mt-1 text-xs text-danger">{err("consent")}</p>}
      </div>
      <Button type="submit" size="lg" variant="primary" loading={pending} className="w-full sm:w-auto">{t("site.submit")}</Button>
    </form>
  );
}

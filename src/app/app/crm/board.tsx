"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Phone, Mail, CalendarClock, UserCheck, Globe, Trash2, Settings2, Briefcase } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { useAction, useServerForm } from "@/components/forms";
import { quickCreate } from "@/components/shell/bus";
import { leadSchema, LEAD_SOURCES } from "@/lib/crm-schemas";
import { formatDate, formatMoney } from "@/lib/time";
import { cn } from "@/lib/utils";
import { saveLeadAction, moveLeadAction, convertLeadAction, deleteLeadAction, saveStagesAction } from "./actions";

type Stage = { id: string; name: string; nameEn: string; nameAr: string; kind: "OPEN" | "WON" | "LOST" };
type Lead = { id: string; name: string; email: string; phone: string; source: string; inquiry: string; service: string; estimatedValue: number | null; stageId: string; assignedTo: { id: string; name: string } | null; nextFollowUpAt: string | null; lostReason: string | null; clientId: string | null; booking: { at: string; mode: string } | null };

export function PipelineBoard({ stages, leads, canManage, canSettings, focus, newBookings }: { stages: Stage[]; leads: Lead[]; canManage: boolean; canSettings: boolean; focus: string | null; newBookings: number }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const { run } = useAction();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [edit, setEdit] = useState<Lead | "new" | null>(focus ? leads.find((l) => l.id === focus) ?? null : null);
  const [stagesOpen, setStagesOpen] = useState(false);
  const pipelineValue = leads.filter((l) => stages.find((s) => s.id === l.stageId)?.kind === "OPEN").reduce((s, l) => s + (l.estimatedValue ?? 0), 0);

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {canManage && <Button variant="primary" onClick={() => setEdit("new")}><Plus /> {t("crm.new")}</Button>}
        {canSettings && <Button variant="secondary" onClick={() => setStagesOpen(true)}><Settings2 /> {t("crm.editStages")}</Button>}
        {newBookings > 0 && <Badge tone="info"><Globe /> {t("crm.bookings")}: {newBookings}</Badge>}
        <span className="ms-auto text-[13px] text-ink-muted">{t("crm.total")}: <span className="ltr-nums font-semibold text-ink">{formatMoney(pipelineValue, locale)}</span></span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
        {stages.map((s) => {
          const list = leads.filter((l) => l.stageId === s.id);
          return (
            <section key={s.id} aria-label={s.name}
              onDragOver={(e) => { if (canManage) { e.preventDefault(); setOver(s.id); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (drag) run(() => moveLeadAction({ id: drag, stageId: s.id }), { onSuccess: () => router.refresh() }); setDrag(null); }}
              className={cn("flex w-72 shrink-0 flex-col rounded-lg border bg-surface-muted/60", over === s.id ? "border-accent bg-accent-soft/60" : "border-line")}>
              <header className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[13px] font-semibold text-ink">{s.name}</span>
                <Badge tone={s.kind === "WON" ? "success" : s.kind === "LOST" ? "outline" : "neutral"}>{list.length}</Badge>
              </header>
              <ul className="flex-1 space-y-2 px-2 pb-2">
                {list.length === 0 && <li className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-[12px] text-ink-subtle">{t("crm.empty")}</li>}
                {list.map((l) => (
                  <li key={l.id} draggable={canManage} onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}>
                    <button type="button" onClick={() => setEdit(l)} className={cn("w-full rounded-md border bg-surface p-3 text-start shadow-xs transition-shadow hover:shadow-md", canManage && "cursor-grab", focus === l.id ? "border-accent" : "border-line")}>
                      <p className="text-[13.5px] font-medium text-ink">{l.name}</p>
                      {l.service && <p className="truncate text-[12px] text-ink-muted">{l.service}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {l.source && <Badge tone={l.source === "WEBSITE" ? "info" : "outline"}>{t(`clients.sources.${l.source}`)}</Badge>}
                        {l.estimatedValue != null && <span className="ltr-nums text-[11.5px] text-ink-muted">{formatMoney(l.estimatedValue, locale)}</span>}
                        {l.clientId && <Badge tone="success"><UserCheck /></Badge>}
                      </div>
                      {(l.nextFollowUpAt || l.booking) && (
                        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-ink-subtle"><CalendarClock className="size-3" /> {formatDate(l.booking?.at ?? l.nextFollowUpAt!, locale, tz)}</p>
                      )}
                      {l.assignedTo && <p className="mt-1 text-[11.5px] text-ink-subtle">{l.assignedTo.name}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {canManage && <p className="text-[12px] text-ink-subtle">{t("crm.dragHint")}</p>}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && <LeadDialog lead={edit === "new" ? null : edit} stages={stages} canManage={canManage} onDone={() => { setEdit(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={stagesOpen} onOpenChange={setStagesOpen}>
        {stagesOpen && <StagesDialog stages={stages} onDone={() => { setStagesOpen(false); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

function LeadDialog({ lead, stages, canManage, onDone }: { lead: Lead | null; stages: Stage[]; canManage: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending: acting } = useAction();
  const [type, setType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const { form, submit, pending, err } = useServerForm({
    schema: leadSchema,
    defaultValues: lead ? { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, source: lead.source, inquiry: lead.inquiry, service: lead.service, estimatedValue: lead.estimatedValue ?? "", assignedToId: lead.assignedTo?.id ?? "", stageId: lead.stageId, nextFollowUpAt: lead.nextFollowUpAt?.slice(0, 10) ?? "" } : { id: "", name: "", email: "", phone: "", source: "PHONE", inquiry: "", service: "", estimatedValue: "", assignedToId: "", stageId: stages[0]?.id ?? "", nextFollowUpAt: "" },
    action: saveLeadAction, successMessage: t("common.changesSaved"), onSuccess: onDone,
  });
  const r = form.register;
  return (
    <DialogContent title={lead ? lead.name : t("crm.new")} size="lg">
      {lead && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-4">
          {lead.phone && <Button asChild size="sm" variant="secondary"><a href={`tel:${lead.phone}`}><Phone /> {lead.phone}</a></Button>}
          {lead.email && <Button asChild size="sm" variant="secondary"><a href={`mailto:${lead.email}`}><Mail /> {t("common.email")}</a></Button>}
          {canManage && <Button size="sm" variant="secondary" onClick={() => { onDone(); setTimeout(() => quickCreate("appointment"), 50); }}><CalendarClock /> {t("crm.schedule")}</Button>}
          {canManage && !lead.clientId && (
            <span className="inline-flex items-center gap-1">
              <Select value={type} onChange={(e) => setType(e.target.value as never)} className="h-8 w-32 text-[12.5px]" aria-label={t("clients.fields.type")}><option value="INDIVIDUAL">{t("enums.partyType.INDIVIDUAL")}</option><option value="COMPANY">{t("enums.partyType.COMPANY")}</option></Select>
              <Button size="sm" variant="primary" loading={acting} onClick={() => run(() => convertLeadAction({ id: lead.id, type }), { success: t("crm.converted"), onSuccess: (d) => router.push(`/app/clients/${(d as { clientId: string }).clientId}`) })}><UserCheck /> {t("crm.convert")}</Button>
            </span>
          )}
          {lead.clientId && <Button asChild size="sm" variant="primary"><Link href={`/app/cases/new?client=${lead.clientId}`}><Briefcase /> {t("crm.openCase")}</Link></Button>}
          {canManage && <Button size="sm" variant="danger-ghost" className="ms-auto" onClick={() => run(() => deleteLeadAction({ id: lead.id }), { onSuccess: onDone })}><Trash2 /></Button>}
        </div>
      )}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <fieldset disabled={!canManage} className="contents">
          <Field label={t("crm.fields.name")} error={err("name")} required>{(a) => <Input {...a} {...r("name")} />}</Field>
          <Field label={t("crm.fields.stage")}>{(a) => <Select {...a} {...r("stageId")}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
          <Field label={t("crm.fields.email")} error={err("email")}>{(a) => <Input {...a} type="email" dir="ltr" {...r("email")} />}</Field>
          <Field label={t("crm.fields.phone")}>{(a) => <Input {...a} type="tel" dir="ltr" {...r("phone")} />}</Field>
          <Field label={t("crm.fields.source")}>{(a) => <Select {...a} {...r("source")}>{LEAD_SOURCES.map((s) => <option key={s} value={s}>{t(`clients.sources.${s}`)}</option>)}</Select>}</Field>
          <Field label={t("crm.fields.service")}>{(a) => <Input {...a} {...r("service")} />}</Field>
          <Field label={t("crm.fields.value")} error={err("estimatedValue")}>{(a) => <Input {...a} type="number" min="0" step="100" dir="ltr" {...r("estimatedValue")} />}</Field>
          <Field label={t("crm.fields.followUp")}>{(a) => <Input {...a} type="date" {...r("nextFollowUpAt")} />}</Field>
          <Field label={t("crm.fields.assignedTo")} className="sm:col-span-2">{(a) => <Picker {...a} type="users" value={form.watch("assignedToId")} initialLabel={lead?.assignedTo?.name} onChange={(i) => form.setValue("assignedToId", i?.id ?? "")} />}</Field>
          <Field label={t("crm.fields.inquiry")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={3} {...r("inquiry")} />}</Field>
        </fieldset>
        {lead?.lostReason && <p className="text-[12.5px] text-ink-muted sm:col-span-2">{t("crm.lostReason")}: {lead.lostReason}</p>}
        {canManage && <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>}
      </form>
    </DialogContent>
  );
}

function StagesDialog({ stages, onDone }: { stages: Stage[]; onDone: () => void }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [rows, setRows] = useState(stages.map((s) => ({ id: s.id as string | undefined, name: s.nameEn, nameAr: s.nameAr, kind: s.kind })));
  return (
    <DialogContent title={t("crm.stages")} size="lg">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2">
            <Input value={r.name} dir="ltr" aria-label={t("clients.fields.nameEn")} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input value={r.nameAr} dir="rtl" aria-label={t("clients.fields.nameAr")} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, nameAr: e.target.value } : x)))} />
            <Select value={r.kind} aria-label={t("common.type")} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as never } : x)))}>{(["OPEN", "WON", "LOST"] as const).map((k) => <option key={k} value={k}>{t(`crm.stageKinds.${k}`)}</option>)}</Select>
            <Button variant="danger-ghost" size="icon" aria-label={t("common.remove")} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { id: undefined, name: "", nameAr: "", kind: "OPEN" }])}><Plus /> {t("settings.reference.addStage")}</Button>
      </div>
      <DialogFooter><Button variant="primary" loading={pending} onClick={() => run(() => saveStagesAction({ stages: rows }), { success: t("common.changesSaved"), onSuccess: onDone })}>{t("common.save")}</Button></DialogFooter>
    </DialogContent>
  );
}

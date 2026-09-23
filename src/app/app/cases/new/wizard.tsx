"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, ShieldCheck, Search, AlertTriangle, Lock, Upload, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Picker } from "@/components/picker";
import { cn } from "@/lib/utils";
import { intakeSchema, type IntakeInput, MATTER_KINDS, PRIORITIES, CONFIDENTIALITY, BILLING, PARTY_ROLES, MEMBER_ROLES } from "@/lib/schemas";
import { createCaseAction, runConflictCheck } from "../actions";

type Opt = { value: string; label: string; group?: string };
type Match = { term: string; type: string; name: string; matter: { id: string | null; internalNumber: string; title: string | null; role: string } | null; similarity: number };

const STEPS = ["client", "opponent", "type", "jurisdiction", "details", "documents", "conflict", "team", "fees", "review"] as const;
const STEP_FIELDS: Record<(typeof STEPS)[number], string[]> = {
  client: ["clientId", "newClient.nameEn"], opponent: ["parties"], type: ["kind", "caseTypeId"], jurisdiction: ["jurisdictionId", "courtId"],
  details: ["title", "titleAr", "officialCaseNumber", "summary", "claims", "claimAmount", "priority", "confidentiality"], documents: [],
  conflict: ["conflictStatus"], team: ["leadLawyerId", "members"], fees: ["billingType", "feeAmount", "hourlyRate"], review: [],
};

export function IntakeWizard({ me, canCreateClient, preClient, options }: {
  me: string; canCreateClient: boolean; preClient: { id: string; label: string } | null;
  options: { caseTypes: Opt[]; jurisdictions: Opt[]; courts: Opt[]; staff: Opt[] };
}) {
  const { t, dir } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [clientMode, setClientMode] = useState<"existing" | "new">(preClient ? "existing" : "existing");
  const [clientLabel, setClientLabel] = useState(preClient?.label ?? "");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openVault, setOpenVault] = useState(true);

  const form = useForm<IntakeInput>({
    resolver: zodResolver(intakeSchema) as unknown as Resolver<IntakeInput>,
    defaultValues: {
      clientId: preClient?.id ?? "", newClient: { nameEn: "", nameAr: "", type: "COMPANY", email: "", phone: "" }, parties: [{ nameEn: "", nameAr: "", type: "COMPANY", role: "OPPONENT", contactId: "" }],
      kind: "COURT_CASE", caseTypeId: "", jurisdictionId: "", courtId: "", title: "", titleAr: "", officialCaseNumber: "", summary: "", claims: "",
      priority: "NORMAL", confidentiality: "STANDARD", conflictStatus: undefined as never, conflictNotes: "", leadLawyerId: me, members: [],
      billingType: "NONE", feeNotes: "", applyChecklist: true,
    },
    mode: "onTouched",
  });
  const { register, watch, setValue, formState } = form;
  const parties = useFieldArray({ control: form.control, name: "parties" });
  const members = useFieldArray({ control: form.control, name: "members" });
  const e = (name: string) => {
    let x: unknown = formState.errors;
    for (const p of name.split(".")) x = (x as Record<string, unknown> | undefined)?.[p];
    const m = (x as { message?: string } | undefined)?.message;
    return m ? t(`validation.${m}`) : undefined;
  };

  const current = STEPS[step];
  const jurisdictionId = watch("jurisdictionId");
  const conf = watch("confidentiality");
  const billing = watch("billingType");

  const validateStep = async () => {
    if (current === "client") {
      if (clientMode === "existing" && !watch("clientId")) { form.setError("clientId", { message: "required" }); return false; }
      if (clientMode === "new" && !watch("newClient.nameEn")?.trim()) { form.setError("newClient.nameEn", { message: "required" }); return false; }
      return true;
    }
    if (current === "conflict") {
      if (!matches) { toast.error(t("intake.checkRequired")); return false; }
      if (!watch("conflictStatus")) { form.setError("conflictStatus", { message: "required" }); return false; }
      return true;
    }
    return form.trigger(STEP_FIELDS[current] as never);
  };
  const next = async () => { if (await validateStep()) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const conflictTerms = () => {
    const names = [clientMode === "new" ? watch("newClient.nameEn") : clientLabel, clientMode === "new" ? watch("newClient.nameAr") : "", ...(watch("parties") ?? []).flatMap((p) => [p.nameEn, p.nameAr])];
    return names.filter((n): n is string => !!n && n.trim().length >= 2);
  };
  const runCheck = async () => {
    const names = conflictTerms();
    if (!names.length) { setMatches([]); return; }
    setChecking(true);
    const r = await runConflictCheck({ names });
    setChecking(false);
    if (r.ok) {
      // The client's own existing matters are expected, not conflicts: keep them but label them.
      setMatches(r.data as Match[]);
      setValue("conflictStatus", (r.data as Match[]).length ? (undefined as never) : "CLEAR");
    } else toast.error(t(`errors.${r.error}`));
  };

  const create = async () => {
    const valid = await form.trigger();
    if (!valid) { toast.error(t("errors.validation")); return; }
    const v = form.getValues();
    const payload: IntakeInput = {
      ...v,
      clientId: clientMode === "existing" ? v.clientId : "",
      newClient: clientMode === "new" ? v.newClient : undefined,
      parties: (v.parties ?? []).filter((p) => p.contactId || p.nameEn?.trim()),
    };
    setCreating(true);
    const r = await createCaseAction(payload);
    setCreating(false);
    if (r.ok) {
      toast.success(t("intake.created", { number: r.data.internalNumber }));
      router.push(openVault ? `/app/cases/${r.data.id}/documents` : `/app/cases/${r.data.id}`);
    } else {
      if (r.fieldErrors) for (const [k, m] of Object.entries(r.fieldErrors)) form.setError(k as never, { message: m });
      toast.error(t(`errors.${r.error}`));
    }
  };

  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
      {/* Stepper */}
      <ol className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin lg:flex-col lg:overflow-visible" aria-label={t("intake.title")}>
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step} aria-current={i === step ? "step" : undefined}
              className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-[13px] transition-colors",
                i === step ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-line" : i < step ? "text-ink-muted hover:bg-surface" : "text-ink-subtle")}>
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular",
                i < step ? "bg-success text-white" : i === step ? "bg-brand text-brand-fg" : "bg-surface-sunken text-ink-subtle")}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{t(`intake.steps.${s}`)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-line bg-surface shadow-xs">
        <div className="border-b border-line px-5 py-3.5">
          <p className="text-[11.5px] font-medium text-ink-subtle tabular">{step + 1} / {STEPS.length}</p>
          <h2 className="text-[15px] font-semibold text-ink">{t(`intake.steps.${current}`)}</h2>
        </div>

        <div className="min-h-[320px] p-5">
          {current === "client" && (
            <div className="space-y-4">
              <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup">
                {(["existing", "new"] as const).filter((m) => m === "existing" || canCreateClient).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={clientMode === m} onClick={() => setClientMode(m)}
                    className={cn("rounded px-3 py-1.5 text-[13px] font-medium", clientMode === m ? "bg-brand text-brand-fg" : "text-ink-muted")}>
                    {t(m === "existing" ? "intake.existingClient" : "intake.newClient")}
                  </button>
                ))}
              </div>
              {clientMode === "existing" ? (
                <Field label={t("workspace.client")} error={e("clientId")} required>
                  {(a) => <Picker {...a} type="clients" value={watch("clientId")} initialLabel={clientLabel} invalid={!!e("clientId")}
                    onChange={(i) => { setValue("clientId", i?.id ?? "", { shouldValidate: true }); setClientLabel(i ? i.label : ""); setMatches(null); }} placeholder={t("intake.searchClient")} />}
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("clients.fields.type")}>{(a) => <Select {...a} {...register("newClient.type")}><option value="COMPANY">{t("enums.partyType.COMPANY")}</option><option value="INDIVIDUAL">{t("enums.partyType.INDIVIDUAL")}</option></Select>}</Field>
                  <span />
                  <Field label={t("intake.clientName")} error={e("newClient.nameEn")} required>{(a) => <Input {...a} dir="ltr" {...register("newClient.nameEn", { onChange: () => setMatches(null) })} />}</Field>
                  <Field label={t("intake.clientNameAr")}>{(a) => <Input {...a} dir="rtl" {...register("newClient.nameAr", { onChange: () => setMatches(null) })} />}</Field>
                  <Field label={t("common.email")} error={e("newClient.email")}>{(a) => <Input {...a} type="email" dir="ltr" {...register("newClient.email")} />}</Field>
                  <Field label={t("common.phone")}>{(a) => <Input {...a} type="tel" dir="ltr" {...register("newClient.phone")} />}</Field>
                </div>
              )}
            </div>
          )}

          {current === "opponent" && (
            <div className="space-y-3">
              {parties.fields.length === 0 && <p className="text-[13px] text-ink-muted">{t("intake.noParties")}</p>}
              {parties.fields.map((f, i) => (
                <div key={f.id} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_1fr_140px_150px_auto]">
                  <Input placeholder={t("intake.partyName")} aria-label={t("intake.partyName")} dir="ltr" {...register(`parties.${i}.nameEn`, { onChange: () => setMatches(null) })} />
                  <Input placeholder={t("intake.partyNameAr")} aria-label={t("intake.partyNameAr")} dir="rtl" {...register(`parties.${i}.nameAr`, { onChange: () => setMatches(null) })} />
                  <Select aria-label={t("common.type")} {...register(`parties.${i}.type`)}><option value="COMPANY">{t("enums.partyType.COMPANY")}</option><option value="INDIVIDUAL">{t("enums.partyType.INDIVIDUAL")}</option></Select>
                  <Select aria-label={t("intake.partyRole")} {...register(`parties.${i}.role`)}>{PARTY_ROLES.map((r) => <option key={r} value={r}>{t(`enums.partyRole.${r}`)}</option>)}</Select>
                  <Button type="button" variant="danger-ghost" size="icon" onClick={() => parties.remove(i)} aria-label={t("common.remove")}><Trash2 /></Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => parties.append({ nameEn: "", nameAr: "", type: "COMPANY", role: "OPPONENT", contactId: "" })}><Plus /> {t("intake.addParty")}</Button>
            </div>
          )}

          {current === "type" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("intake.kind")} required>{(a) => <Select {...a} {...register("kind")}>{MATTER_KINDS.map((k) => <option key={k} value={k}>{t(`enums.matterKind.${k}`)}</option>)}</Select>}</Field>
              <Field label={t("intake.caseType")}>{(a) => <Select {...a} {...register("caseTypeId")}><option value="">{t("common.notSet")}</option>{options.caseTypes.map((c) => <option key={c.value} value={c.value}>{c.group ? `${c.group} › ` : ""}{c.label}</option>)}</Select>}</Field>
              <Checkbox className="sm:col-span-2" label={t("intake.applyChecklist")} {...register("applyChecklist")} />
            </div>
          )}

          {current === "jurisdiction" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("intake.jurisdiction")}>{(a) => <Select {...a} {...register("jurisdictionId", { onChange: () => setValue("courtId", "") })}><option value="">{t("common.notSet")}</option>{options.jurisdictions.map((j) => <option key={j.value} value={j.value}>{j.label} — {t(`enums.jurisdictionKind.${j.group}`)}</option>)}</Select>}</Field>
                <Field label={t("intake.court")}>{(a) => <Select {...a} {...register("courtId")}><option value="">{t("common.notSet")}</option>{options.courts.filter((c) => !jurisdictionId || c.group === jurisdictionId).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>}</Field>
              </div>
              <p className="rounded-md bg-info-soft px-3 py-2.5 text-[12.5px] text-info">{t("intake.jurisdictionNote")}</p>
            </div>
          )}

          {current === "details" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("intake.caseTitle")} error={e("title")} required>{(a) => <Input {...a} dir="ltr" {...register("title")} />}</Field>
              <Field label={t("intake.caseTitleAr")}>{(a) => <Input {...a} dir="rtl" {...register("titleAr")} />}</Field>
              <Field label={t("intake.officialNumber")} hint={t("intake.officialNumberHint")}>{(a) => <Input {...a} dir="ltr" className="font-mono" {...register("officialCaseNumber")} />}</Field>
              <Field label={t("intake.claimAmount")} error={e("claimAmount")}>{(a) => <Input {...a} type="number" min="0" step="0.01" dir="ltr" {...register("claimAmount")} />}</Field>
              <Field label={t("common.priority")}>{(a) => <Select {...a} {...register("priority")}>{PRIORITIES.map((k) => <option key={k} value={k}>{t(`enums.priority.${k}`)}</option>)}</Select>}</Field>
              <Field label={t("intake.confidentiality")} hint={conf === "HIGHLY_CONFIDENTIAL" ? t("intake.highlyConfidentialHint") : undefined}>{(a) => <Select {...a} {...register("confidentiality")}>{CONFIDENTIALITY.map((k) => <option key={k} value={k}>{t(`enums.confidentiality.${k}`)}</option>)}</Select>}</Field>
              <Field label={t("intake.summary")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={4} {...register("summary")} />}</Field>
              <Field label={t("intake.claims")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={3} {...register("claims")} />}</Field>
            </div>
          )}

          {current === "documents" && (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-ink-subtle"><Upload className="size-5" /></span>
              <p className="max-w-md text-[13.5px] text-ink-muted">{t("intake.documentsNote")}</p>
              <Checkbox checked={openVault} onChange={(ev) => setOpenVault(ev.target.checked)} label={t("intake.uploadAfter")} />
            </div>
          )}

          {current === "conflict" && (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-muted">{t("intake.conflictIntro")}</p>
              <div className="flex flex-wrap gap-1.5">
                {conflictTerms().map((n) => <Badge key={n} tone="outline">{n}</Badge>)}
              </div>
              <Button type="button" variant={matches ? "secondary" : "primary"} onClick={runCheck} loading={checking}>
                <Search /> {matches ? t("intake.rerun") : t("intake.runCheck")}
              </Button>
              {matches && (
                matches.length === 0 ? (
                  <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2.5 text-[13px] text-success"><ShieldCheck className="size-4" /> {t("intake.noMatches")}</p>
                ) : (
                  <div className="rounded-md border border-warning/30">
                    <p className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning"><AlertTriangle className="size-4" /> {t("intake.potentialMatches", { n: matches.length })}</p>
                    <ul className="max-h-64 divide-y divide-line overflow-y-auto scrollbar-thin">
                      {matches.map((m, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                          <Badge tone="neutral">{m.type === "PARTY" ? t(`enums.partyRole.${m.matter?.role}`) : t(`enums.contactCategory.${m.type === "CLIENT" ? "CLIENT" : "OTHER"}`)}</Badge>
                          <span className="font-medium text-ink">{m.name}</span>
                          <span className="text-[11.5px] text-ink-subtle">“{m.term}” · {Math.round(m.similarity * 100)}% {t("intake.similarity")}</span>
                          {m.matter && (
                            m.matter.id ? (
                              <a href={`/app/cases/${m.matter.id}`} target="_blank" rel="noreferrer" className="ms-auto text-[12px] text-accent hover:underline"><span className="ltr-nums font-mono">{m.matter.internalNumber}</span> · {m.matter.title}</a>
                            ) : (
                              <span className="ms-auto inline-flex items-center gap-1 text-[12px] text-ink-subtle"><Lock className="size-3" /> <span className="ltr-nums font-mono">{m.matter.internalNumber}</span> · {t("intake.restrictedMatter")}</span>
                            )
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
              {matches && (
                <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                  <Field label={t("intake.decision")} error={e("conflictStatus")} required>
                    {(a) => <Select {...a} {...register("conflictStatus")}><option value="">{t("common.select")}</option>
                      <option value="CLEAR">{t("intake.decisionClear")}</option>
                      {matches.length > 0 && <option value="POTENTIAL_MATCH_REVIEWED">{t("intake.decisionReviewed")}</option>}
                      {matches.length > 0 && <option value="WAIVED">{t("intake.decisionWaived")}</option>}
                    </Select>}
                  </Field>
                  <Field label={t("intake.decisionNotes")}>{(a) => <Textarea {...a} rows={2} {...register("conflictNotes")} />}</Field>
                </div>
              )}
            </div>
          )}

          {current === "team" && (
            <div className="space-y-4">
              <Field label={t("intake.lead")}>{(a) => <Select {...a} {...register("leadLawyerId")}>{options.staff.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.group}</option>)}</Select>}</Field>
              <div>
                <p className="mb-2 text-[13px] font-medium">{t("intake.teamMembers")}</p>
                <div className="space-y-2">
                  {members.fields.map((f, i) => (
                    <div key={f.id} className="grid grid-cols-[1fr_180px_auto] gap-2">
                      <Select aria-label={t("common.name")} {...register(`members.${i}.userId`)}>{options.staff.filter((s) => s.value !== me).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
                      <Select aria-label={t("workspace.memberRole")} {...register(`members.${i}.role`)}>{MEMBER_ROLES.map((r) => <option key={r} value={r}>{t(`enums.memberRole.${r}`)}</option>)}</Select>
                      <Button type="button" variant="danger-ghost" size="icon" onClick={() => members.remove(i)} aria-label={t("common.remove")}><Trash2 /></Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => members.append({ userId: options.staff.find((s) => s.value !== me)?.value ?? "", role: "ASSIGNED" })}><Plus /> {t("intake.addMember")}</Button>
              </div>
              {conf === "HIGHLY_CONFIDENTIAL" && <p className="rounded-md bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">{t("intake.highlyConfidentialHint")}</p>}
            </div>
          )}

          {current === "fees" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("intake.fees")}>{(a) => <Select {...a} {...register("billingType")}>{BILLING.map((k) => <option key={k} value={k}>{t(`enums.billingType.${k}`)}</option>)}</Select>}</Field>
              {billing !== "NONE" && billing !== "HOURLY" && <Field label={t("intake.feeAmount")} error={e("feeAmount")}>{(a) => <Input {...a} type="number" min="0" step="0.01" dir="ltr" {...register("feeAmount")} />}</Field>}
              {billing === "HOURLY" && <Field label={t("intake.hourlyRate")} error={e("hourlyRate")}>{(a) => <Input {...a} type="number" min="0" step="0.01" dir="ltr" {...register("hourlyRate")} />}</Field>}
              <Field label={t("intake.feeNotes")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={2} {...register("feeNotes")} />}</Field>
            </div>
          )}

          {current === "review" && (
            <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
              {[
                [t("workspace.client"), clientMode === "new" ? watch("newClient.nameEn") : clientLabel],
                [t("intake.caseTitle"), watch("title")],
                [t("intake.kind"), t(`enums.matterKind.${watch("kind")}`)],
                [t("intake.caseType"), options.caseTypes.find((c) => c.value === watch("caseTypeId"))?.label ?? "—"],
                [t("intake.court"), options.courts.find((c) => c.value === watch("courtId"))?.label ?? "—"],
                [t("intake.officialNumber"), watch("officialCaseNumber") || "—"],
                [t("common.priority"), t(`enums.priority.${watch("priority")}`)],
                [t("intake.confidentiality"), t(`enums.confidentiality.${watch("confidentiality")}`)],
                [t("intake.lead"), options.staff.find((s) => s.value === watch("leadLawyerId"))?.label ?? "—"],
                [t("intake.steps.conflict"), watch("conflictStatus") ? t(`enums.conflictStatus.${watch("conflictStatus")}`) : "—"],
                [t("intake.fees"), t(`enums.billingType.${watch("billingType")}`)],
                [t("workspace.parties"), (watch("parties") ?? []).filter((p) => p.nameEn).map((p) => p.nameEn).join(", ") || "—"],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-line pb-2">
                  <dt className="text-[11.5px] text-ink-subtle">{k}</dt>
                  <dd className="mt-0.5 text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-muted/50 px-5 py-3">
          <Button type="button" variant="ghost" onClick={prev} disabled={step === 0}><Prev /> {t("common.previous")}</Button>
          {current === "review" ? (
            <Button type="button" variant="primary" onClick={create} loading={creating}>
              {creating ? <Loader2 className="animate-spin" /> : <Check />} {creating ? t("intake.creating") : t("intake.create")}
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={next}>{t("common.next")} <Next /></Button>
          )}
        </div>
      </div>
    </div>
  );
}

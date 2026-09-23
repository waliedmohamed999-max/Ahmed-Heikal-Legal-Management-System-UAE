"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, Users, MessageCircle, FileSignature, StickyNote, Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useServerForm } from "@/components/forms";
import { communicationSchema } from "@/lib/schemas";
import { formatDateTime, toZonedLocalInput } from "@/lib/time";
import { logCommunicationAction } from "@/app/app/collab-actions";

const ICON: Record<string, LucideIcon> = { EMAIL: Mail, CALL: Phone, MEETING: Users, WHATSAPP: MessageCircle, LETTER: FileSignature, NOTE: StickyNote };
const DIR: Record<string, LucideIcon> = { INBOUND: ArrowDownLeft, OUTBOUND: ArrowUpRight, INTERNAL: ArrowLeftRight };

type Item = { id: string; channel: string; direction: string; subject: string | null; body: string | null; occurredAt: string; user: string | null };

export function CommunicationsView({ matterId, clientId, canLog, items }: { matterId?: string; clientId?: string; canLog: boolean; items: Item[] }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Panel title={t("workspace.tabs.communications")} actions={canLog && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus /> {t("workspace.commLog")}</Button>}>
      {items.length === 0 ? (
        <EmptyState icon={<Mail />} title={t("workspace.commEmpty")} action={canLog && <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus /> {t("workspace.commLog")}</Button>} />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => {
            const Icon = ICON[c.channel] ?? StickyNote;
            const Dir = DIR[c.direction] ?? ArrowLeftRight;
            return (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink-muted"><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className="font-medium text-ink">{c.subject || t(`workspace.channels.${c.channel}`)}</span>
                    <span className="inline-flex items-center gap-0.5 text-[12px] text-ink-subtle"><Dir className="size-3.5 rtl:-scale-x-100" /> {t(`workspace.directions.${c.direction}`)}</span>
                  </div>
                  {c.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] text-ink-muted">{c.body}</p>}
                  <p className="mt-1 text-[12px] text-ink-subtle">{formatDateTime(c.occurredAt, locale, tz)}{c.user && ` · ${c.user}`}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>{open && <LogDialog matterId={matterId} clientId={clientId} onDone={() => { setOpen(false); router.refresh(); }} />}</Dialog>
    </Panel>
  );
}

function LogDialog({ matterId, clientId, onDone }: { matterId?: string; clientId?: string; onDone: () => void }) {
  const { t, tz } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: communicationSchema,
    defaultValues: { matterId: matterId ?? "", clientId: clientId ?? "", channel: "CALL", direction: "OUTBOUND", subject: "", body: "", occurredAt: toZonedLocalInput(new Date(), tz) },
    action: logCommunicationAction,
    onSuccess: onDone,
    successMessage: t("common.changesSaved"),
  });
  const r = form.register;
  return (
    <DialogContent title={t("workspace.commLog")}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("workspace.channel")}>{(a) => <Select {...a} {...r("channel")}>{Object.keys(ICON).map((c) => <option key={c} value={c}>{t(`workspace.channels.${c}`)}</option>)}</Select>}</Field>
          <Field label={t("workspace.direction")}>{(a) => <Select {...a} {...r("direction")}>{Object.keys(DIR).map((c) => <option key={c} value={c}>{t(`workspace.directions.${c}`)}</option>)}</Select>}</Field>
          <Field label={t("common.date")} error={err("occurredAt")}>{(a) => <Input {...a} type="datetime-local" {...r("occurredAt")} />}</Field>
        </div>
        <Field label={t("workspace.subject")}>{(a) => <Input {...a} {...r("subject")} />}</Field>
        <Field label={t("common.notes")}>{(a) => <Textarea {...a} rows={4} {...r("body")} />}</Field>
        <DialogFooter><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

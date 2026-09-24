"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle2, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { hearingPrepAction } from "@/app/app/event-actions";

/** The working area of focus mode: questions, arguments and preparation notes. */
export function PrepEditor({ hearingId, matterId, canEdit, canAi, status, initial }: { hearingId: string; matterId: string; canEdit: boolean; canAi: boolean; status: string; initial: { questions: string; arguments: string; preparationNotes: string } }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const { run, pending } = useAction();
  const dirty = v.questions !== initial.questions || v.arguments !== initial.arguments || v.preparationNotes !== initial.preparationNotes;
  const save = (st?: "PREPARING" | "READY") => run(() => hearingPrepAction({ id: hearingId, ...v, status: st ?? (status === "SCHEDULED" ? "PREPARING" : undefined) }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() });
  return (
    <section id="prep" aria-labelledby="prep-h" className="scroll-mt-28">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 id="prep-h" className="text-heading font-semibold text-ink">{t("focus.work")}</h2>
        {canAi && (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/app/ai?matter=${matterId}&task=HEARING_BRIEF&hearing=${hearingId}`}><Sparkles /> {t("hearings.generateBrief")}</Link>
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-5">
        <Field label={t("hearings.arguments")}>{(a) => <Textarea {...a} rows={8} value={v.arguments} disabled={!canEdit} onChange={(e) => setV({ ...v, arguments: e.target.value })} className="bidi-plain text-ui leading-relaxed" />}</Field>
        <Field label={t("hearings.questions")}>{(a) => <Textarea {...a} rows={5} value={v.questions} disabled={!canEdit} onChange={(e) => setV({ ...v, questions: e.target.value })} className="bidi-plain text-ui leading-relaxed" />}</Field>
        <Field label={t("hearings.preparationNotes")}>{(a) => <Textarea {...a} rows={4} value={v.preparationNotes} disabled={!canEdit} onChange={(e) => setV({ ...v, preparationNotes: e.target.value })} className="bidi-plain" />}</Field>
        {canEdit && (
          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <Button variant={status === "READY" ? "primary" : "secondary"} loading={pending} disabled={!dirty && status !== "SCHEDULED"} onClick={() => save()}><Save /> {t("common.save")}</Button>
            {status !== "READY" && <Button variant="primary" loading={pending} onClick={() => save("READY")}><CheckCircle2 /> {t("hearings.markReady")}</Button>}
          </div>
        )}
      </div>
    </section>
  );
}

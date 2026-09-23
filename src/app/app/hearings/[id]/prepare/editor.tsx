"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle2, Sparkles, HelpCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { hearingPrepAction } from "@/app/app/event-actions";

export function PrepEditor({ hearingId, matterId, canEdit, canAi, status, initial }: { hearingId: string; matterId: string; canEdit: boolean; canAi: boolean; status: string; initial: { questions: string; arguments: string; preparationNotes: string } }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const { run, pending } = useAction();
  const save = (st?: "PREPARING" | "READY") => run(() => hearingPrepAction({ id: hearingId, ...v, status: st ?? (status === "SCHEDULED" ? "PREPARING" : undefined) }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() });
  return (
    <Panel title={`${t("hearings.questions")} · ${t("hearings.arguments")}`} icon={<HelpCircle />}
      actions={canAi && <Button asChild size="sm" variant="secondary"><Link href={`/app/ai?matter=${matterId}&task=HEARING_BRIEF&hearing=${hearingId}`}><Sparkles /> {t("hearings.generateBrief")}</Link></Button>}>
      <div className="grid gap-4 p-4">
        <Field label={t("hearings.questions")}>{(a) => <Textarea {...a} rows={4} value={v.questions} disabled={!canEdit} onChange={(e) => setV({ ...v, questions: e.target.value })} />}</Field>
        <Field label={t("hearings.arguments")}>{(a) => <Textarea {...a} rows={5} value={v.arguments} disabled={!canEdit} onChange={(e) => setV({ ...v, arguments: e.target.value })} />}</Field>
        <Field label={t("hearings.preparationNotes")}>{(a) => <Textarea {...a} rows={3} value={v.preparationNotes} disabled={!canEdit} onChange={(e) => setV({ ...v, preparationNotes: e.target.value })} />}</Field>
        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" loading={pending} onClick={() => save()}><Save /> {t("common.save")}</Button>
            {status !== "READY" && <Button variant="primary" loading={pending} onClick={() => save("READY")}><CheckCircle2 /> {t("hearings.markReady")}</Button>}
          </div>
        )}
      </div>
    </Panel>
  );
}

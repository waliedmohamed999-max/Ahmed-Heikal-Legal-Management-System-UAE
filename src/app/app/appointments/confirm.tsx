"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/forms";
import { appointmentStatusAction } from "../event-actions";

export function ConfirmAppointment({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="xs" variant="primary" loading={pending} onClick={() => run(() => appointmentStatusAction({ id, status: "CONFIRMED" }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() })}><Check /> {t("appointmentsPage.confirm")}</Button>
      <Button size="xs" variant="ghost" onClick={() => run(() => appointmentStatusAction({ id, status: "CANCELLED" }), { onSuccess: () => router.refresh() })}><X /> {t("appointments.cancel")}</Button>
    </div>
  );
}

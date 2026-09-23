"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { useAction } from "@/components/forms";
import { toggleAutomationAction } from "../actions";

export function AutomationToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const { t } = useI18n();
  const [on, setOn] = useState(enabled);
  const { run, pending } = useAction();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("settings.reminders.enabled")}
      disabled={pending}
      onClick={() => { const next = !on; setOn(next); run(() => toggleAutomationAction({ id, enabled: next }), { success: t("settings.saved") }); }}
      className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-success" : "bg-line-strong"}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${on ? "start-[18px]" : "start-0.5"}`} />
    </button>
  );
}

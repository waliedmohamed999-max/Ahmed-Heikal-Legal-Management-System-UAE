"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { saveDashboardWidgets } from "./actions";

const LABEL: Record<string, string> = {
  nextHearing: "hearingWidget.label", critical: "dashboard.critical", agenda: "dashboard.agenda", tasks: "dashboard.tasks",
  activity: "dashboard.activity", approvals: "dashboard.approvals", portfolio: "dashboard.portfolio", workload: "dashboard.workload", finance: "dashboard.finance",
};

export function WidgetCustomizer({ widgets, hidden }: { widgets: string[]; hidden: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [off, setOff] = useState(new Set(hidden));
  const [pending, start] = useTransition();

  const toggle = (w: string) => {
    const next = new Set(off);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    setOff(next);
    start(async () => {
      const r = await saveDashboardWidgets({ hidden: [...next] as never });
      if (!r.ok) {
        toast.error(t(`errors.${r.error}`));
        setOff(off);
      } else router.refresh();
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" loading={pending}>
          <SlidersHorizontal /> {t("dashboard.customize")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <p className="px-2 pb-1.5 pt-1 text-caption font-medium uppercase tracking-wide text-ink-subtle">{t("dashboard.widgets")}</p>
        <ul>
          {widgets.map((w) => (
            <li key={w}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-body hover:bg-surface-muted">
                <input type="checkbox" checked={!off.has(w)} onChange={() => toggle(w)} className="size-4 accent-[var(--accent)]" />
                {t(LABEL[w])}
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

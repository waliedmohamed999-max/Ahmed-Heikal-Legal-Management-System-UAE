"use client";

import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useQueryNav } from "@/app/app/cases/toolbar";
import { FilterMenu, FilterChips, SearchField } from "@/components/filters";

/** Generic URL-synced search + dropdown filters (+ removable chips) for server-rendered lists. */
export function ListSearch({ placeholder, filters = [], className, trailing }: { placeholder: string; filters?: { key: string; label: string; options: { value: string; label: string }[] }[]; className?: string; trailing?: React.ReactNode }) {
  const { t } = useI18n();
  const { sp, set, pending } = useQueryNav();
  const chips = filters
    .filter((f) => sp.get(f.key))
    .map((f) => ({ key: f.key, label: f.label, value: f.options.find((o) => o.value === sp.get(f.key))?.label ?? sp.get(f.key)!, onRemove: () => set({ [f.key]: null }) }));
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={sp.get("q") ?? ""} onChange={(q) => set({ q })} placeholder={placeholder} className="w-full sm:w-72" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
          {filters.map((f) => (
            <FilterMenu key={f.key} label={f.label} value={sp.get(f.key)} options={f.options} onChange={(v) => set({ [f.key]: v })} />
          ))}
          {pending && <Loader2 className="size-4 shrink-0 animate-spin text-ink-subtle" aria-label={t("common.loading")} />}
        </div>
        {trailing && <div className="flex items-center gap-1.5">{trailing}</div>}
      </div>
      <FilterChips chips={chips} onClear={() => set({ q: null, ...Object.fromEntries(filters.map((f) => [f.key, null])) })} />
    </div>
  );
}

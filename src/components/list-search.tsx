"use client";

import { useEffect, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQueryNav } from "@/app/app/cases/toolbar";

/** Generic URL-synced search + filter bar for server-rendered lists. */
export function ListSearch({ placeholder, filters = [], className }: { placeholder: string; filters?: { key: string; label: string; options: { value: string; label: string }[] }[]; className?: string }) {
  const { t } = useI18n();
  const { sp, set, pending } = useQueryNav();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => {
    const h = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = !!q || filters.some((f) => sp.get(f.key));
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="ps-8" aria-label={t("common.search")} />
      </div>
      {filters.map((f) => (
        <Select key={f.key} aria-label={f.label} value={sp.get(f.key) ?? ""} onChange={(e) => set({ [f.key]: e.target.value || null })}
          className={cn("h-8 w-auto max-w-[200px] text-[13px]", sp.get(f.key) && "border-accent/60 bg-accent-soft")}>
          <option value="">{f.label}: {t("common.all")}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ))}
      {active && (
        <Button variant="ghost" size="sm" onClick={() => { setQ(""); set(Object.fromEntries([["q", null], ...filters.map((f) => [f.key, null])])); }}>
          <X /> {t("common.clear")}
        </Button>
      )}
      {pending && <Loader2 className="size-4 animate-spin text-ink-subtle" />}
    </div>
  );
}

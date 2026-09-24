"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Search, X, Rows3, Rows4 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { Segmented } from "@/components/ui/layout";

export type FilterOpt = { value: string; label: string };

/** Compact dropdown filter button: "Status ▾" → "Status: Active ▾" when set. */
export function FilterMenu({ label, value, options, onChange, className }: { label: string; value?: string | null; options: FilterOpt[]; onChange: (v: string | null) => void; className?: string }) {
  const { t } = useI18n();
  const current = options.find((o) => o.value === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 max-w-[220px] shrink-0 items-center gap-1 rounded-md border px-2.5 text-body transition-colors",
            current ? "border-accent/30 bg-accent-soft text-ink" : "border-line-strong border-dashed bg-surface text-ink-muted hover:border-ink-subtle/50 hover:text-ink",
            className,
          )}
        >
          <span className={cn(current && "text-ink-muted")}>{label}</span>
          {current && <span className="truncate font-medium">: {current.label}</span>}
          <ChevronDown className="size-3.5 shrink-0 text-ink-subtle" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <MenuItem onSelect={() => onChange(null)}>
          <Check className={cn(!current ? "opacity-100" : "opacity-0")} />
          {t("common.all")}
        </MenuItem>
        <MenuSeparator />
        {options.map((o) => (
          <MenuItem key={o.value} onSelect={() => onChange(o.value)}>
            <Check className={cn(o.value === value ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{o.label}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** Row of removable chips for the active filters, with "Clear all". */
export function FilterChips({ chips, onClear }: { chips: { key: string; label: string; value: string; onRemove: () => void }[]; onClear: () => void }) {
  const { t } = useI18n();
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-6 items-center gap-1 rounded-sm border border-line bg-surface-muted ps-2 pe-1 text-meta text-ink-muted">
          {c.label}: <span className="font-medium text-ink">{c.value}</span>
          <button type="button" onClick={c.onRemove} className="rounded-sm p-0.5 text-ink-subtle hover:bg-surface-sunken hover:text-ink" aria-label={`${t("common.remove")} ${c.label}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="px-1.5 text-meta font-medium text-ink-muted hover:text-ink">
        {t("shell.clearFilters")}
      </button>
    </div>
  );
}

/** Debounced search field sized for toolbars. */
export function SearchField({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState(value);
  // Follow external resets (e.g. "Clear all") — adjust state during render, not in an effect.
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setQ(value);
  }
  useEffect(() => {
    if (q === value) return;
    const h = setTimeout(() => onChange(q), 280);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={t("common.search")}
        className="h-10 w-full rounded-md border border-line-strong bg-surface ps-8 pe-2.5 text-[16px] text-ink placeholder:text-ink-subtle transition-colors hover:border-ink-subtle/50 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/12 sm:h-8 sm:text-body"
      />
    </div>
  );
}

/** Comfortable / compact density toggle. Persisted in a non-sensitive cookie. */
export function DensityToggle({ value, onChange }: { value: "comfortable" | "compact"; onChange?: (v: "comfortable" | "compact") => void }) {
  const { t } = useI18n();
  return (
    <Segmented
      size="sm"
      value={value}
      onChange={(v) => {
        document.cookie = `ahl_density=${v}; path=/; max-age=31536000; samesite=lax`;
        onChange?.(v);
      }}
      options={[
        { value: "comfortable", label: <span className="sr-only">{t("shell.comfortable")}</span>, icon: <Rows3 aria-label={t("shell.comfortable")} /> },
        { value: "compact", label: <span className="sr-only">{t("shell.compact")}</span>, icon: <Rows4 aria-label={t("shell.compact")} /> },
      ]}
    />
  );
}

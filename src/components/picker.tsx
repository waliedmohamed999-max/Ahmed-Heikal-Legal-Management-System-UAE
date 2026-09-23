"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

export type PickItem = { id: string; label: string; labelAr?: string | null; sub?: string | null; clientId?: string };

/**
 * Accessible async combobox backed by /api/lookup. Keyboard: type to search,
 * ↑/↓ to move, Enter to select, Esc to close.
 */
export function Picker({
  type,
  value,
  onChange,
  placeholder,
  initialLabel,
  id,
  invalid,
  disabled,
}: {
  type: "clients" | "contacts" | "matters" | "users" | "courts";
  value: string | null | undefined;
  onChange: (item: PickItem | null) => void;
  placeholder?: string;
  initialLabel?: string | null;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [label, setLabel] = useState(initialLabel ?? "");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = setTimeout(() => setDq(q), 180);
    return () => clearTimeout(h);
  }, [q]);
  const [prevInitial, setPrevInitial] = useState(initialLabel);
  if (initialLabel !== prevInitial) {
    setPrevInitial(initialLabel);
    setLabel(initialLabel ?? "");
  }

  const { data, isFetching, isError } = useQuery({
    queryKey: ["lookup", type, dq],
    enabled: open,
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/lookup?type=${type}&q=${encodeURIComponent(dq)}`, { signal });
      if (!r.ok) throw new Error("lookup failed");
      return (await r.json()) as { items: PickItem[] };
    },
  });
  const items = data?.items ?? [];
  const text = (i: PickItem) => (locale === "ar" ? i.labelAr || i.label : i.label);
  const pick = (i: PickItem) => {
    onChange(i);
    setLabel(text(i));
    setOpen(false);
    setQ("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTimeout(() => inputRef.current?.focus(), 20); }}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id ?? type}-list`}
          aria-haspopup="listbox"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-start text-sm shadow-xs hover:border-ink-subtle/60 disabled:opacity-60",
            invalid && "border-danger",
          )}
        >
          <span className={cn("flex-1 truncate", !value && "text-ink-subtle")}>{value ? label || "…" : placeholder ?? t("common.select")}</span>
          {value && !disabled ? (
            <span role="button" tabIndex={-1} aria-label={t("common.clear")} onClick={(e) => { e.stopPropagation(); onChange(null); setLabel(""); }} className="rounded p-0.5 text-ink-subtle hover:bg-surface-muted">
              <X className="size-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="size-3.5 text-ink-subtle" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <div className="flex items-center gap-2 border-b border-line px-3">
          {isFetching ? <Loader2 className="size-4 animate-spin text-ink-subtle" /> : <Search className="size-4 text-ink-subtle" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && items[active]) { e.preventDefault(); pick(items[active]); }
            }}
            placeholder={t("common.search")}
            className="h-10 flex-1 bg-transparent text-sm outline-none"
            role="combobox"
            aria-expanded
            aria-controls={`${id ?? type}-list`}
          />
        </div>
        <ul id={`${id ?? type}-list`} role="listbox" className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
          {isError && <li className="px-3 py-4 text-center text-[13px] text-danger">{t("errors.network")}</li>}
          {!isError && !isFetching && items.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-ink-muted">{t("common.noResults")}</li>}
          {items.map((i, idx) => (
            <li key={i.id} role="option" aria-selected={i.id === value}>
              <button type="button" onMouseEnter={() => setActive(idx)} onClick={() => pick(i)}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[13px]", idx === active && "bg-surface-muted")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{text(i)}</span>
                  {i.sub && <span className="ltr-nums block truncate text-[11.5px] text-ink-subtle">{i.sub}</span>}
                </span>
                {i.id === value && <Check className="size-4 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

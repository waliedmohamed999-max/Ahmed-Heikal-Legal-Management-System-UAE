"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Columns3, Bookmark, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { saveCaseColumns, saveCaseView, deleteCaseView } from "./actions";

import { ALL_COLUMNS } from "./columns";

type Opt = { value: string; label: string };

/** URL-driven list controls — filtering, sorting and paging always happen on the server. */
export function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { sp, set, pending };
}

export function CasesToolbar({
  views,
  query,
  columns,
  savedViews,
  options,
}: {
  views: string[];
  query: { view: string; q?: string; status?: string; kind?: string; priority?: string; lawyer?: string; court?: string; sort: string; dir: string };
  columns: string[];
  savedViews: { id: string; name: string; filters: Record<string, string> }[];
  options: { lawyers: Opt[]; courts: Opt[] };
}) {
  const { t } = useI18n();
  const { sp, set, pending } = useQueryNav();
  const [q, setQ] = useState(query.q ?? "");
  const [cols, setCols] = useState(new Set(columns));
  const [viewName, setViewName] = useState("");

  useEffect(() => {
    const id = setTimeout(() => {
      if ((query.q ?? "") !== q) set({ q });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggleCol = async (c: string) => {
    const next = new Set(cols);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setCols(next);
    const r = await saveCaseColumns({ columns: ALL_COLUMNS.filter((x) => next.has(x)) });
    if (!r.ok) toast.error(t(`errors.${r.error}`));
  };

  const saveView = async () => {
    const filters: Record<string, string> = {};
    sp.forEach((v, k) => k !== "page" && (filters[k] = v));
    const r = await saveCaseView({ name: viewName, filters });
    if (r.ok) {
      toast.success(t("cases.viewSaved"));
      setViewName("");
    } else toast.error(t(`errors.${r.error}`));
  };

  const hasFilters = !!(query.q || query.status || query.kind || query.priority || query.lawyer || query.court);

  return (
    <div className="mt-6 space-y-3">
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-thin" aria-label={t("cases.title")}>
        {views.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => set({ view: v === "all" ? null : v })}
            aria-current={query.view === v ? "page" : undefined}
            className={cn(
              "h-8 shrink-0 rounded-md px-3 text-[13px] font-medium transition-colors",
              query.view === v ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-surface hover:text-ink",
            )}
          >
            {t(`cases.views.${v}`)}
          </button>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cases.searchPlaceholder")} className="ps-8" aria-label={t("common.search")} />
        </div>
        <FilterSelect label={t("common.status")} value={query.status} onChange={(v) => set({ status: v })}
          options={["INTAKE", "ACTIVE", "PENDING", "ON_HOLD", "CLOSED", "ARCHIVED"].map((s) => ({ value: s, label: t(`enums.matterStatus.${s}`) }))} />
        <FilterSelect label={t("common.priority")} value={query.priority} onChange={(v) => set({ priority: v })}
          options={["CRITICAL", "HIGH", "NORMAL", "LOW"].map((s) => ({ value: s, label: t(`enums.priority.${s}`) }))} />
        <FilterSelect label={t("cases.col.type")} value={query.kind} onChange={(v) => set({ kind: v })}
          options={["COURT_CASE", "CONSULTATION", "CONTRACT", "DISPUTE", "EXECUTION", "APPEAL", "ARBITRATION", "OTHER"].map((s) => ({ value: s, label: t(`enums.matterKind.${s}`) }))} />
        <FilterSelect label={t("cases.col.lawyer")} value={query.lawyer} onChange={(v) => set({ lawyer: v })} options={options.lawyers} />
        <FilterSelect label={t("cases.col.court")} value={query.court} onChange={(v) => set({ court: v })} options={options.courts} className="hidden lg:block" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); set({ q: null, status: null, kind: null, priority: null, lawyer: null, court: null }); }}>
            <X /> {t("common.clear")}
          </Button>
        )}
        {pending && <Loader2 className="size-4 animate-spin text-ink-subtle" aria-label={t("common.loading")} />}
        <div className="ms-auto flex items-center gap-2">
          <Select aria-label="Sort" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [s, d] = e.target.value.split(":"); set({ sort: s, dir: d }); }} className="h-8 w-auto text-[13px]">
            {(["activity", "opened", "number", "priority", "title"] as const).flatMap((s) =>
              (["desc", "asc"] as const).map((d) => (
                <option key={`${s}:${d}`} value={`${s}:${d}`}>{t(`cases.sort.${s}`)} {d === "desc" ? "↓" : "↑"}</option>
              )),
            )}
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm"><Columns3 /> <span className="hidden sm:inline">{t("cases.columns")}</span></Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2">
              {ALL_COLUMNS.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-muted">
                  <input type="checkbox" checked={cols.has(c)} onChange={() => toggleCol(c)} className="size-4 accent-[var(--accent)]" />
                  {t(`cases.col.${c}`)}
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm"><Bookmark /> <span className="hidden sm:inline">{t("cases.savedViews")}</span></Button>
            </MenuTrigger>
            <MenuContent className="w-64">
              {savedViews.map((v) => (
                <MenuItem key={v.id} onSelect={() => set(Object.fromEntries(["view", "q", "status", "kind", "priority", "lawyer", "court", "sort", "dir"].map((k) => [k, v.filters[k] ?? null])))}>
                  <Bookmark /> <span className="flex-1 truncate">{v.name}</span>
                  <button type="button" aria-label={t("common.delete")} onClick={(e) => { e.stopPropagation(); deleteCaseView({ id: v.id }); }} className="rounded p-0.5 hover:bg-surface-sunken">
                    <X className="size-3.5" />
                  </button>
                </MenuItem>
              ))}
              {savedViews.length > 0 && <MenuSeparator />}
              <div className="flex gap-1.5 p-1.5" onKeyDown={(e) => e.stopPropagation()}>
                <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder={t("cases.viewName")} className="h-8 text-[13px]" />
                <Button size="sm" variant="primary" disabled={!viewName.trim()} onClick={saveView}>{t("common.save")}</Button>
              </div>
            </MenuContent>
          </Menu>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, className }: { label: string; value?: string; onChange: (v: string | null) => void; options: Opt[]; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={className}>
      <Select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={cn("h-8 w-auto max-w-[180px] text-[13px]", value && "border-accent/60 bg-accent-soft")}>
        <option value="">{label}: {t("common.all")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </div>
  );
}

export function Pager({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  const { t, dir } = useI18n();
  const { set } = useQueryNav();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-muted">
      <span>{t("common.results", { n: total })}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, false)} aria-label={t("common.previous")}><Prev /></Button>
          <span className="tabular">{t("common.page", { n: page })} / {pages}</span>
          <Button variant="ghost" size="icon-xs" disabled={page >= pages} onClick={() => set({ page: String(page + 1) }, false)} aria-label={t("common.next")}><Next /></Button>
        </div>
      )}
    </div>
  );
}

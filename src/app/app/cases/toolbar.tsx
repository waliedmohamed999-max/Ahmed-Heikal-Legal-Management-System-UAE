"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, Bookmark, X, ChevronLeft, ChevronRight, Loader2, ChevronDown, ArrowUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { FilterMenu, FilterChips, SearchField, DensityToggle, type FilterOpt } from "@/components/filters";
import { saveCaseColumns, saveCaseView, deleteCaseView } from "./actions";
import { ALL_COLUMNS } from "./columns";

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
  return { sp, set, pending, refresh: () => start(() => router.refresh()) };
}

const PRIMARY_VIEWS = ["all", "mine", "active", "urgent", "closed"];
const FILTER_KEYS = ["q", "status", "kind", "priority", "lawyer", "court"] as const;

export function CasesToolbar({
  views,
  query,
  columns,
  savedViews,
  options,
  density,
}: {
  views: string[];
  query: { view: string; q?: string; status?: string; kind?: string; priority?: string; lawyer?: string; court?: string; sort: string; dir: string };
  columns: string[];
  savedViews: { id: string; name: string; filters: Record<string, string> }[];
  options: { lawyers: FilterOpt[]; courts: FilterOpt[] };
  density: "comfortable" | "compact";
}) {
  const { t } = useI18n();
  const { sp, set, pending, refresh } = useQueryNav();
  const [cols, setCols] = useState(new Set(columns));
  const [viewName, setViewName] = useState("");

  const toggleCol = async (c: string) => {
    const next = new Set(cols);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setCols(next);
    const r = await saveCaseColumns({ columns: ALL_COLUMNS.filter((x) => next.has(x)) });
    if (!r.ok) toast.error(t(`errors.${r.error}`));
    else refresh();
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

  const statusOpts = ["INTAKE", "ACTIVE", "PENDING", "ON_HOLD", "CLOSED", "ARCHIVED"].map((s) => ({ value: s, label: t(`enums.matterStatus.${s}`) }));
  const priorityOpts = ["CRITICAL", "HIGH", "NORMAL", "LOW"].map((s) => ({ value: s, label: t(`enums.priority.${s}`) }));
  const kindOpts = ["COURT_CASE", "CONSULTATION", "CONTRACT", "DISPUTE", "EXECUTION", "APPEAL", "ARBITRATION", "OTHER"].map((s) => ({ value: s, label: t(`enums.matterKind.${s}`) }));
  const find = (o: FilterOpt[], v?: string) => o.find((x) => x.value === v)?.label ?? v ?? "";

  const chips = [
    query.status && { key: "status", label: t("common.status"), value: find(statusOpts, query.status), onRemove: () => set({ status: null }) },
    query.lawyer && { key: "lawyer", label: t("cases.col.lawyer"), value: find(options.lawyers, query.lawyer), onRemove: () => set({ lawyer: null }) },
    query.court && { key: "court", label: t("cases.col.court"), value: find(options.courts, query.court), onRemove: () => set({ court: null }) },
    query.kind && { key: "kind", label: t("cases.col.type"), value: find(kindOpts, query.kind), onRemove: () => set({ kind: null }) },
    query.priority && { key: "priority", label: t("common.priority"), value: find(priorityOpts, query.priority), onRemove: () => set({ priority: null }) },
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];

  const primaryViews = views.filter((v) => PRIMARY_VIEWS.includes(v));
  const moreViews = views.filter((v) => !PRIMARY_VIEWS.includes(v));
  const moreActive = moreViews.includes(query.view);
  const sorts = ["activity", "opened", "number", "priority", "title"] as const;

  return (
    <div className="mt-4 space-y-3">
      {/* Views */}
      <div className="flex items-center gap-1 border-b border-line">
        <nav className="-mb-px flex min-w-0 flex-1 items-center gap-4 overflow-x-auto scrollbar-none" aria-label={t("cases.title")}>
          {primaryViews.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => set({ view: v === "all" ? null : v })}
              aria-current={query.view === v ? "page" : undefined}
              className={cn("h-10 shrink-0 border-b-2 text-body font-medium transition-colors", query.view === v ? "border-ink text-ink" : "border-transparent text-ink-subtle hover:text-ink")}
            >
              {t(`cases.views.${v}`)}
            </button>
          ))}
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className={cn("inline-flex h-10 shrink-0 items-center gap-1 border-b-2 text-body font-medium transition-colors", moreActive ? "border-ink text-ink" : "border-transparent text-ink-subtle hover:text-ink")}>
                {moreActive ? t(`cases.views.${query.view}`) : t("shell.moreViews")}
                <ChevronDown className="size-3.5" />
              </button>
            </MenuTrigger>
            <MenuContent align="start" className="w-56">
              {moreViews.map((v) => (
                <MenuItem key={v} onSelect={() => set({ view: v })}>
                  <Check className={cn(query.view === v ? "opacity-100" : "opacity-0")} />
                  {t(`cases.views.${v}`)}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </nav>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0"><Bookmark /> <span className="hidden sm:inline">{t("cases.savedViews")}</span></Button>
          </MenuTrigger>
          <MenuContent className="w-64">
            {savedViews.length > 0 && <MenuLabel>{t("cases.savedViews")}</MenuLabel>}
            {savedViews.map((v) => (
              <MenuItem key={v.id} onSelect={() => set(Object.fromEntries(["view", ...FILTER_KEYS, "sort", "dir"].map((k) => [k, v.filters[k] ?? null])))}>
                <Bookmark /> <span className="flex-1 truncate">{v.name}</span>
                <button type="button" aria-label={t("common.delete")} onClick={(e) => { e.stopPropagation(); deleteCaseView({ id: v.id }); }} className="rounded p-0.5 hover:bg-surface-sunken">
                  <X className="size-3.5" />
                </button>
              </MenuItem>
            ))}
            {savedViews.length > 0 && <MenuSeparator />}
            <div className="flex gap-1.5 p-1.5" onKeyDown={(e) => e.stopPropagation()}>
              <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder={t("cases.viewName")} className="sm:h-7" />
              <Button size="sm" variant="primary" disabled={!viewName.trim()} onClick={saveView}>{t("common.save")}</Button>
            </div>
          </MenuContent>
        </Menu>
      </div>

      {/* Search + filters + display */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={query.q ?? ""} onChange={(v) => set({ q: v })} placeholder={t("cases.searchPlaceholder")} className="w-full sm:w-64" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
          <FilterMenu label={t("common.status")} value={query.status} options={statusOpts} onChange={(v) => set({ status: v })} />
          <FilterMenu label={t("cases.col.lawyer")} value={query.lawyer} options={options.lawyers} onChange={(v) => set({ lawyer: v })} />
          <FilterMenu label={t("cases.col.court")} value={query.court} options={options.courts} onChange={(v) => set({ court: v })} />
          <FilterMenu label={t("cases.col.type")} value={query.kind} options={kindOpts} onChange={(v) => set({ kind: v })} />
          <FilterMenu label={t("common.priority")} value={query.priority} options={priorityOpts} onChange={(v) => set({ priority: v })} />
          {pending && <Loader2 className="size-4 shrink-0 animate-spin text-ink-subtle" aria-label={t("common.loading")} />}
        </div>
        <div className="flex items-center gap-1.5">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm"><ArrowUpDown /> <span className="hidden lg:inline">{t(`cases.sort.${query.sort}`)}</span></Button>
            </MenuTrigger>
            <MenuContent className="w-52">
              <MenuLabel>{t("shell.sort")}</MenuLabel>
              {sorts.flatMap((s) =>
                (["desc", "asc"] as const).map((d) => (
                  <MenuItem key={`${s}:${d}`} onSelect={() => set({ sort: s, dir: d })}>
                    <Check className={cn(query.sort === s && query.dir === d ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1">{t(`cases.sort.${s}`)}</span>
                    <span className="text-ink-subtle">{d === "desc" ? "↓" : "↑"}</span>
                  </MenuItem>
                )),
              )}
            </MenuContent>
          </Menu>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("shell.columns")}><Columns3 /></Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1">
              <div className="px-2 pb-1 pt-1.5 text-meta text-ink-subtle">{t("shell.columns")}</div>
              {ALL_COLUMNS.map((c) => (
                <label key={c} className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-body hover:bg-surface-muted">
                  <input type="checkbox" checked={cols.has(c)} onChange={() => toggleCol(c)} className="size-4 accent-[var(--brand)]" />
                  {t(`cases.col.${c}`)}
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <div className="hidden md:block">
            <DensityToggle value={density} onChange={refresh} />
          </div>
        </div>
      </div>

      <FilterChips chips={chips} onClear={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} />
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
    <div className="flex items-center justify-between border-t border-line px-4 py-2 text-meta text-ink-muted">
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

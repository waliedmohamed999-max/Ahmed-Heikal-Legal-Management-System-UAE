import Link from "next/link";
import { LinkTabs } from "@/components/ui/layout";
import { cn } from "@/lib/utils";

/** Shared header for My tasks / All tasks: route tabs + quiet bucket switcher with counts. */
export function TasksHeader({
  title,
  actions,
  scope,
  scopeTabs,
  buckets,
  current,
  counts,
  hrefFor,
  labelFor,
}: {
  title: string;
  actions?: React.ReactNode;
  scope: "mine" | "all";
  scopeTabs: { key: "mine" | "all"; href: string; label: string }[];
  buckets: readonly string[];
  current: string;
  counts: Record<string, number>;
  hrefFor: (b: string) => string;
  labelFor: (b: string) => string;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
        {actions}
      </div>
      <div className="mt-3 border-b border-line">
        <LinkTabs active={scope} tabs={scopeTabs} />
      </div>
      <nav className="mt-3 flex gap-1 overflow-x-auto scrollbar-none" aria-label={title}>
        {buckets.map((b) => {
          const n = counts[b];
          const on = current === b;
          return (
            <Link
              key={b}
              href={hrefFor(b)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-body transition-colors",
                on ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
              )}
            >
              {labelFor(b)}
              {n != null && n > 0 && <span className={cn("text-meta tabular", b === "overdue" ? "font-medium text-danger" : "text-ink-subtle")}>{n}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

import { cn } from "@/lib/utils";

/**
 * Data table. Density: `comfortable` (40px rows, default) or `compact` (32px).
 * Header is quiet (small, subtle) and sticks to the top of the scroll area.
 */
export function Table({ className, children, density = "comfortable", ...props }: React.TableHTMLAttributes<HTMLTableElement> & { density?: "comfortable" | "compact" }) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table data-density={density} className={cn("group/table w-full border-collapse text-body", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-[1] bg-surface", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-8 whitespace-nowrap border-b border-line px-3 text-start text-meta font-medium text-ink-subtle first:ps-4 last:pe-4", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("group border-b border-line/80 transition-colors last:border-0 hover:bg-surface-muted", className)} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-10 px-3 align-middle first:ps-4 last:pe-4 group-data-[density=compact]/table:h-8", className)} {...props} />;
}

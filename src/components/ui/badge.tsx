import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badges are reserved for status, priority, verification and confidentiality.
 * Everything else is plain text.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-meta font-medium leading-[18px] [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-soft text-ink-muted",
        info: "bg-info-soft text-info",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        high: "bg-high-soft text-high",
        danger: "bg-danger-soft text-danger",
        critical: "bg-critical-soft text-critical",
        brand: "bg-brand text-brand-fg",
        outline: "border border-line-strong leading-4 text-ink-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Dot({ className, color }: { className?: string; color?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={color ? { background: color } : undefined} />;
}

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink-muted", info: "text-info", success: "text-success", warning: "text-warning", high: "text-high",
  danger: "text-danger", critical: "text-critical", brand: "text-ink", outline: "text-ink-subtle",
};
const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-ink-subtle", info: "bg-info", success: "bg-success", warning: "bg-warning", high: "bg-high",
  danger: "bg-danger", critical: "bg-critical", brand: "bg-brand", outline: "bg-line-strong",
};

/** Quiet status: coloured dot + text. Use in dense tables instead of filled pills. */
export function StatusText({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-body", TONE_TEXT[tone], className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      {children}
    </span>
  );
}

/** Priority as a tiny bar glyph + label (never colour alone). */
export function PriorityText({ priority, label, className }: { priority: string; label: React.ReactNode; className?: string }) {
  const level = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 }[priority] ?? 2;
  const color = priority === "CRITICAL" ? "bg-critical" : priority === "HIGH" ? "bg-high" : "bg-ink-subtle";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-body", priority === "CRITICAL" ? "text-critical" : priority === "HIGH" ? "text-high" : "text-ink-muted", className)}>
      <span aria-hidden className="flex h-3 items-end gap-px">
        {[1, 2, 3, 4].map((b) => (
          <span key={b} className={cn("w-[3px] rounded-[1px]", b <= level ? color : "bg-line-strong")} style={{ height: `${3 + b * 2}px` }} />
        ))}
      </span>
      {label}
    </span>
  );
}

// Semantic tone maps — one place decides what colour a status means.
export const PRIORITY_TONE: Record<string, Tone> = { CRITICAL: "critical", HIGH: "high", NORMAL: "neutral", LOW: "outline" };
export const MATTER_STATUS_TONE: Record<string, Tone> = {
  INTAKE: "info", ACTIVE: "success", PENDING: "warning", ON_HOLD: "neutral", CLOSED: "outline", ARCHIVED: "outline",
};
export const ALERT_TONE: Record<string, Tone> = {
  OVERDUE: "danger", IMMEDIATE: "critical", CRITICAL: "critical", HIGH: "high", PRIORITY: "warning", REMINDER: "info", NONE: "neutral",
};
export const DOC_STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral", UNDER_REVIEW: "info", CHANGES_REQUESTED: "warning", APPROVED: "success", SUBMITTED: "brand",
};
export const TASK_STATUS_TONE: Record<string, Tone> = { TODO: "neutral", IN_PROGRESS: "info", WAITING: "warning", DONE: "success", CANCELLED: "outline" };
export const HEARING_STATUS_TONE: Record<string, Tone> = {
  SCHEDULED: "neutral", PREPARING: "warning", READY: "success", HELD: "info", ADJOURNED: "outline", CANCELLED: "outline",
};
export const INVOICE_STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", ISSUED: "info", PARTIALLY_PAID: "warning", PAID: "success", VOID: "outline" };

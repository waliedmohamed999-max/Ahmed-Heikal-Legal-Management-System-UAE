import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11.5px] font-medium leading-4 [&_svg]:size-3",
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
        outline: "border border-line-strong text-ink-muted",
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

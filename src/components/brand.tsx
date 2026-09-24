import { cn } from "@/lib/utils";

/** AH monogram — a restrained seal-like mark, no gold, no emoji. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="currentColor" opacity="0.08" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="none" stroke="currentColor" strokeOpacity="0.35" />
      <path d="M7.5 23 L12.2 9h2.1L19 23h-2.4l-1.1-3.4h-4.6L9.8 23H7.5Zm3.8-5.4h3.5l-1.75-5.5-1.75 5.5Z" fill="currentColor" />
      <path d="M20.5 9h2.2v5.9h2.6V9h2.2v14h-2.2v-6.1h-2.6V23h-2.2V9Z" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className, sub }: { className?: string; sub?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo />
      <div className="leading-tight">
        <div className="text-body font-semibold tracking-tight">AH Legal OS</div>
        {sub && <div className="text-caption opacity-60">{sub}</div>}
      </div>
    </div>
  );
}

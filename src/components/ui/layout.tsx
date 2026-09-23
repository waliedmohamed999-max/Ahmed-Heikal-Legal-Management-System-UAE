import Link from "next/link";
import { cn, initials } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-ink-subtle">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A quiet bordered section — the main building block instead of heavy "cards". */
export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  id,
  footer,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  footer?: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 id={id ? `${id}-title` : undefined} className="flex items-center gap-2 text-[13px] font-semibold text-ink [&_svg]:size-4 [&_svg]:text-ink-subtle">
            {icon}
            {title}
          </h2>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-line px-4 py-2.5">{footer}</div>}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-12", className)}>
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-subtle [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse-soft rounded-md bg-surface-sunken", className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-muted px-1 font-mono text-[10.5px] text-ink-muted", className)}>
      {children}
    </kbd>
  );
}

const AVATAR_TONES = ["#3f37c9", "#0e7490", "#7a3eb1", "#a15c07", "#067647", "#52607a", "#b42318", "#2f5bd3"];

export function Avatar({ name, src, size = 28, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38), background: src ? undefined : tone }}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** Label/value pair used in record headers and overviews. */
export function Meta({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11.5px] font-medium text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/** Route-backed tabs (each tab is a URL — shareable, back-button friendly, server-rendered). */
export function LinkTabs({ tabs, active, className }: { tabs: { href: string; label: React.ReactNode; key: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("-mb-px flex gap-1 overflow-x-auto scrollbar-thin", className)} aria-label="Tabs">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] font-medium transition-colors",
              on ? "border-brand text-ink dark:border-accent" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="rounded bg-surface-sunken px-1 text-[11px] tabular text-ink-muted">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Stat({ label, value, sub, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger" | "warning" | "success" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink";
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-ink-subtle">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular tracking-tight", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

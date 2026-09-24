import Link from "next/link";
import { cn, initials } from "@/lib/utils";

// ─────────────────────────── Page container ───────────────────────────
/**
 * Page width system. `full` for operational views (dashboard, tables, calendar),
 * `default` for record pages, `narrow` for forms/settings, `text` for reading.
 */
export function Page({ children, width = "default", className }: { children: React.ReactNode; width?: "full" | "default" | "narrow" | "text"; className?: string }) {
  const w = { full: "max-w-none", default: "max-w-[1320px]", narrow: "max-w-[960px]", text: "max-w-[760px]" }[width];
  return <div className={cn("mx-auto w-full px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6", w, className)}>{children}</div>;
}

// ─────────────────────────── Page header ───────────────────────────
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  meta,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-meta text-ink-subtle">{eyebrow}</div>}
        <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-2xl text-body text-ink-muted">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-muted">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ─────────────────────────── Sections ───────────────────────────
/** Heading row for a region of a page — title, optional count, trailing actions. No box. */
export function SectionHeader({
  title,
  count,
  actions,
  className,
  as: H = "h2",
  id,
}: {
  title: React.ReactNode;
  count?: number | null;
  actions?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
  id?: string;
}) {
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-3", className)}>
      <H id={id} className="flex min-w-0 items-center gap-2 text-heading font-semibold text-ink">
        <span className="truncate">{title}</span>
        {count != null && <span className="rounded-sm bg-surface-sunken px-1.5 text-meta font-medium tabular text-ink-muted">{count}</span>}
      </H>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/**
 * A quiet bordered region. `plain` removes the box (for use directly on the white
 * working surface); the default keeps a hairline border — never a floating card.
 */
export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  id,
  footer,
  count,
  plain,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  footer?: React.ReactNode;
  count?: number | null;
  plain?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(plain ? "min-w-0" : "min-w-0 rounded-lg border border-line bg-surface", className)}
      aria-labelledby={title && id ? `${id}-title` : undefined}
    >
      {(title || actions) && (
        <div className={cn("flex min-h-10 items-center justify-between gap-3", plain ? "mb-1 border-b border-line pb-2" : "border-b border-line px-4 py-1.5")}>
          <h2 id={id ? `${id}-title` : undefined} className="flex min-w-0 items-center gap-2 text-body font-semibold text-ink [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-ink-subtle">
            {icon}
            <span className="truncate">{title}</span>
            {count != null && <span className="rounded-sm bg-surface-sunken px-1.5 text-caption font-medium tabular text-ink-muted">{count}</span>}
          </h2>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
      {footer && <div className={cn("border-t border-line py-2", plain ? "" : "px-4")}>{footer}</div>}
    </section>
  );
}

/** Small "View all →" style link used in section headers. */
export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded px-1.5 py-0.5 text-meta font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink">
      {children}
    </Link>
  );
}

// ─────────────────────────── Key / value ───────────────────────────
/** Key-value list — replaces "a card per value". Columns stack on small screens. */
export function DetailList({ items, className, columns = 1 }: { items: { label: React.ReactNode; value: React.ReactNode; key?: string }[]; className?: string; columns?: 1 | 2 }) {
  return (
    <dl className={cn("grid gap-x-6", columns === 2 ? "sm:grid-cols-2" : "grid-cols-1", className)}>
      {items.map((i, n) => (
        <div key={i.key ?? n} className="grid min-w-0 grid-cols-[minmax(96px,38%)_1fr] items-baseline gap-3 border-b border-line/70 py-2 last:border-0">
          <dt className="truncate text-meta text-ink-subtle">{i.label}</dt>
          <dd className="min-w-0 text-body text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/value pair used in record headers. */
export function Meta({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-caption text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-body text-ink">{children}</dd>
    </div>
  );
}

// ─────────────────────────── Stats ───────────────────────────
export function Stat({ label, value, sub, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger" | "warning" | "success" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink";
  return (
    <div className="min-w-0">
      <div className="truncate text-meta text-ink-subtle">{label}</div>
      <div className={cn("mt-0.5 text-[18px] font-semibold leading-7 tabular tracking-tight", color)}>{value}</div>
      {sub && <div className="text-meta text-ink-muted">{sub}</div>}
    </div>
  );
}

/** Inline stat strip — a single row of figures separated by hairlines (no stat cards). */
export function InlineStats({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode; href?: string; tone?: "danger" | "warning" | "success"; key?: string }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-stretch divide-line sm:divide-x rtl:sm:divide-x-reverse", className)}>
      {items.map((i, n) => {
        const color = i.tone === "danger" ? "text-danger" : i.tone === "warning" ? "text-warning" : i.tone === "success" ? "text-success" : "text-ink";
        const body = (
          <>
            <span className={cn("text-[18px] font-semibold leading-7 tabular", color)}>{i.value}</span>
            <span className="text-meta text-ink-muted">{i.label}</span>
          </>
        );
        const cls = "flex min-w-0 basis-1/3 items-baseline gap-1.5 py-1 pe-3 sm:basis-auto sm:gap-2 sm:px-5 sm:first:ps-0";
        return i.href ? (
          <Link key={i.key ?? n} href={i.href} className={cn(cls, "rounded-sm transition-colors hover:text-ink [&:hover_span:last-child]:text-ink")}>{body}</Link>
        ) : (
          <div key={i.key ?? n} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Rows & timeline ───────────────────────────
/** Generic list row: leading slot, title, meta line, trailing slot. Link when href given. */
export function EntityRow({
  href,
  leading,
  title,
  meta,
  trailing,
  className,
  dense,
}: {
  href?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  dense?: boolean;
}) {
  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-ink bidi-plain">{title}</div>
        {meta && <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-meta text-ink-muted">{meta}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </>
  );
  const cls = cn("flex items-center gap-3 px-3", dense ? "py-1.5" : "py-2.5", href && "rounded-md transition-colors hover:bg-surface-muted", className);
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/** Vertical timeline. Each item: time/label column, marker, content. */
export function Timeline({ items, className }: { items: { key: string; time?: React.ReactNode; color?: string; icon?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; body?: React.ReactNode; href?: string; highlight?: boolean; trailing?: React.ReactNode }[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {items.map((i, n) => {
        const content = (
          <div className={cn("min-w-0 flex-1 rounded-md px-2 py-1.5", i.href && "transition-colors hover:bg-surface-muted", i.highlight && "bg-accent-soft/60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-body font-medium text-ink bidi-plain">{i.title}</div>
                {i.meta && <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-meta text-ink-muted">{i.meta}</div>}
                {i.body && <div className="mt-1 text-body text-ink-muted bidi-plain">{i.body}</div>}
              </div>
              {i.trailing && <div className="shrink-0">{i.trailing}</div>}
            </div>
          </div>
        );
        return (
          <li key={i.key} className="relative flex gap-3">
            {i.time !== undefined && <div className="w-14 shrink-0 pt-2 text-end text-meta tabular text-ink-subtle">{i.time}</div>}
            <div className="relative flex w-4 shrink-0 justify-center">
              {n < items.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 w-px bg-line" />}
              <span
                aria-hidden
                className={cn("relative mt-2.5 flex size-2.5 items-center justify-center rounded-full ring-4 ring-surface", i.icon && "mt-1.5 size-5 bg-surface-muted [&_svg]:size-3")}
                style={!i.icon ? { background: i.color ?? "var(--line-strong)" } : { color: i.color }}
              >
                {i.icon}
              </span>
            </div>
            {i.href ? <Link href={i.href} className="min-w-0 flex-1 pb-1">{content}</Link> : <div className="min-w-0 flex-1 pb-1">{content}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────── Empty / loading ───────────────────────────
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
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-6 py-14", className)}>
      {icon && <div className="mb-2.5 text-ink-subtle [&_svg]:size-5 [&_svg]:stroke-[1.5]">{icon}</div>}
      <p className="text-body font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-body text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse-soft rounded-md bg-surface-sunken", className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-line-strong bg-surface px-1 font-mono text-[10.5px] text-ink-subtle", className)}>
      {children}
    </kbd>
  );
}

// ─────────────────────────── Avatar ───────────────────────────
const AVATAR_TONES = ["#3b4aa8", "#1b6f82", "#6d4a9c", "#9a5b08", "#17754a", "#5b6477", "#a33a2e", "#2f5596"];

export function Avatar({ name, src, size = 28, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)), background: src ? undefined : tone }}
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

export function AvatarStack({ people, max = 4, size = 22 }: { people: { name: string; photoUrl?: string | null }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="flex items-center -space-x-1.5 rtl:space-x-reverse">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} src={p.photoUrl} size={size} className="ring-2 ring-surface" />
      ))}
      {people.length > max && <span className="ms-2 text-meta text-ink-subtle">+{people.length - max}</span>}
    </span>
  );
}

// ─────────────────────────── Tabs ───────────────────────────
/** Route-backed tabs (each tab is a URL — shareable, back-button friendly, server-rendered). */
export function LinkTabs({ tabs, active, className }: { tabs: { href: string; label: React.ReactNode; key: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("-mb-px flex gap-4 overflow-x-auto scrollbar-none", className)} aria-label="Tabs">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-body font-medium transition-colors",
              on ? "border-ink text-ink dark:border-accent" : "border-transparent text-ink-subtle hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className={cn("text-meta tabular", on ? "text-ink-muted" : "text-ink-subtle")}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Segmented control for switching a view in-place (List/Board, Compact/Comfortable…). */
export function Segmented<T extends string>({ options, value, onChange, className, size = "sm" }: { options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; size?: "xs" | "sm" }) {
  return (
    <div role="radiogroup" className={cn("inline-flex items-center rounded-md border border-line bg-surface-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[5px] px-2 font-medium transition-colors [&_svg]:size-3.5",
            size === "xs" ? "h-6 text-meta" : "h-7 text-body",
            value === o.value ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-subtle hover:text-ink",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

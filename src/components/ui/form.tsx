import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

/**
 * One control height everywhere: 32px on desktop; 40px with 16px text on phones
 * (prevents iOS focus-zoom and gives a proper touch target).
 */
const fieldBase =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 text-[16px] text-ink placeholder:text-ink-subtle transition-colors duration-150 sm:text-body " +
  "hover:border-ink-subtle/50 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/12 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 aria-invalid:border-danger aria-invalid:focus:ring-danger/12";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10 sm:h-8", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(fieldBase, "py-2 leading-relaxed", className)} {...props} />;
});

/** Native select: fully accessible, keyboard- and mobile-friendly, RTL-correct. */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative min-w-0">
      <select ref={ref} className={cn(fieldBase, "h-10 appearance-none pe-7 sm:h-8", className)} {...props}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-body font-medium text-ink", className)} {...props} />;
}

/**
 * Field wrapper: label above, control, helper text, error below —
 * wired with aria-describedby / aria-invalid. Render-prop receives the ids.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (a: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ms-0.5 text-danger" aria-hidden>*</span>}
        </Label>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined })}
      {hint && !error && (
        <p id={hintId} className="text-meta text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-meta font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-body text-ink", className)}>
      <input type="checkbox" className="size-4 rounded-sm border-line-strong accent-[var(--brand)]" {...props} />
      {label}
    </label>
  );
}

/** A form section: title + description on the start side, fields on the end side (Settings pattern). */
export function FormSection({ title, description, children, className }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-4 border-b border-line py-6 first:pt-0 last:border-0 md:grid-cols-[minmax(0,240px)_1fr] md:gap-8", className)}>
      <div>
        <h2 className="text-heading font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-body text-ink-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

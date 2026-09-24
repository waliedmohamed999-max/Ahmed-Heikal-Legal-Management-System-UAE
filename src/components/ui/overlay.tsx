"use client";

import { Dialog as D, DropdownMenu as DM, Tooltip as TT, Popover as PO } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const OVERLAY = "fixed inset-0 z-50 bg-[#0d1220]/35 data-[state=open]:animate-fade-in";

// ─────────────────────────── Dialog (small, focused tasks) ───────────────────────────
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = "md",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const w = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <D.Portal>
      <D.Overlay className={OVERLAY} />
      <D.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-lg outline-none data-[state=open]:animate-slide-up",
          "sm:inset-x-auto sm:bottom-auto sm:start-1/2 sm:top-[9vh] sm:w-full sm:rounded-2xl sm:ltr:-translate-x-1/2 sm:rtl:translate-x-1/2",
          w,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div className="min-w-0">
            <D.Title className="text-heading font-semibold text-ink">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-body text-ink-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>
            )}
          </div>
          <D.Close className="-me-1.5 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="px-5 pb-4 pt-3">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("-mx-5 -mb-4 mt-5 flex items-center justify-end gap-2 border-t border-line px-5 py-3", className)}>{children}</div>;
}

// ─────────────────────────── Drawer (records, detail, lots of data) ───────────────────────────
export function SheetContent({
  title,
  description,
  children,
  side = "end",
  className,
  headerActions,
  size = "md",
  footer,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  side?: "end" | "start";
  className?: string;
  headerActions?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
}) {
  const w = { sm: "sm:max-w-sm", md: "sm:max-w-[440px]", lg: "sm:max-w-[640px]" }[size];
  return (
    <D.Portal>
      <D.Overlay className={OVERLAY} />
      <D.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full flex-col bg-surface shadow-lg outline-none",
          side === "end" ? "end-0 border-s border-line ltr:data-[state=open]:animate-drawer-in rtl:data-[state=open]:animate-drawer-in-rtl" : "start-0 border-e border-line data-[state=open]:animate-fade-in",
          w,
          className,
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <div className="min-w-0">
            <D.Title className="truncate text-heading font-semibold text-ink">{title}</D.Title>
            <D.Description className={description ? "truncate text-meta text-ink-muted" : "sr-only"}>{description ?? ""}</D.Description>
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <D.Close className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}

// ─────────────────────────── Dropdown menu ───────────────────────────
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;

export function MenuContent({ children, align = "end", className, side }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        side={side}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-md data-[state=open]:animate-fade-in", className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({ className, destructive, ...props }: React.ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-body outline-none [&_svg]:size-4 [&_svg]:text-ink-subtle",
        "data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive ? "text-danger [&_svg]:text-danger" : "text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="truncate px-2 pb-1 pt-1.5 text-meta text-ink-subtle">{children}</DM.Label>;
}
export const MenuSeparator = () => <DM.Separator className="-mx-1 my-1 h-px bg-line" />;

// ─────────────────────────── Tooltip ───────────────────────────
export const TooltipProvider = TT.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TT.Root delayDuration={300}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-50 rounded-md bg-[#15171c] px-2 py-1 text-meta text-white shadow-md data-[state=delayed-open]:animate-fade-in">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

// ─────────────────────────── Popover ───────────────────────────
export const Popover = PO.Root;
export const PopoverTrigger = PO.Trigger;
export function PopoverContent({ children, className, align = "end" }: { children: React.ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <PO.Portal>
      <PO.Content align={align} sideOffset={6} className={cn("z-50 rounded-lg border border-line bg-surface shadow-md outline-none data-[state=open]:animate-fade-in", className)}>
        {children}
      </PO.Content>
    </PO.Portal>
  );
}

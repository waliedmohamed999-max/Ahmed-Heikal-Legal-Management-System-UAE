"use client";

import { Dialog as D, DropdownMenu as DM, Tooltip as TT, Popover as PO } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────── Dialog ───────────────────────────
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
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[#0c1424]/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl border border-line bg-surface shadow-lg outline-none data-[state=open]:animate-slide-up",
          "sm:inset-x-auto sm:bottom-auto sm:start-1/2 sm:top-[10vh] sm:w-full sm:rounded-lg sm:ltr:-translate-x-1/2 sm:rtl:translate-x-1/2",
          w,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-[15px] font-semibold text-ink">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-[13px] text-ink-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>
            )}
          </div>
          <D.Close className="-m-1 rounded p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("-mx-5 -mb-4 mt-5 flex items-center justify-end gap-2 border-t border-line bg-surface-muted/60 px-5 py-3", className)}>{children}</div>;
}

// ─────────────────────────── Sheet (side drawer) ───────────────────────────
export function SheetContent({
  title,
  description,
  children,
  side = "end",
  className,
  headerActions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  side?: "end" | "start";
  className?: string;
  headerActions?: React.ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[#0c1424]/30 data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full max-w-md flex-col border-line bg-surface shadow-lg outline-none data-[state=open]:animate-fade-in",
          side === "end" ? "end-0 border-s" : "start-0 border-e",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <D.Title className="text-[15px] font-semibold">{title}</D.Title>
            <D.Description className={description ? "text-[13px] text-ink-muted" : "sr-only"}>{description ?? ""}</D.Description>
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <D.Close className="rounded p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

// ─────────────────────────── Dropdown menu ───────────────────────────
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;

export function MenuContent({ children, align = "end", className }: { children: React.ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
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
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none [&_svg]:size-4 [&_svg]:text-ink-subtle",
        "data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive ? "text-danger [&_svg]:text-danger" : "text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DM.Label className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{children}</DM.Label>;
}
export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;

// ─────────────────────────── Tooltip ───────────────────────────
export const TooltipProvider = TT.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TT.Root delayDuration={300}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-50 rounded-md bg-[#0c1424] px-2 py-1 text-xs text-white shadow-md data-[state=delayed-open]:animate-fade-in">
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

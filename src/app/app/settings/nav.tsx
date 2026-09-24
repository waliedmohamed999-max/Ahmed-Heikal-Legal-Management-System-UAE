"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto scrollbar-none lg:sticky lg:top-16 lg:flex-col lg:gap-0.5 lg:overflow-visible" aria-label="Settings">
      {items.map((i) => {
        const on = pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={cn("flex h-8 shrink-0 items-center rounded-md px-2.5 text-body transition-colors", on ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

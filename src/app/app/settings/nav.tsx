"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin lg:flex-col lg:overflow-visible" aria-label="Settings">
      {items.map((i) => {
        const on = pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={cn("shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", on ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-ink-muted hover:bg-surface hover:text-ink")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

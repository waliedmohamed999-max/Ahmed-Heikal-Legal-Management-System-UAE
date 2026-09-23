"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SiteNav({ items, bookLabel }: { items: { href: string; label: string }[]; bookLabel: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? pathname === "/" : pathname.startsWith(h));
  return (
    <>
      <nav className="ms-auto hidden items-center gap-1 md:flex" aria-label="Site">
        {items.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined} className={cn("rounded-md px-3 py-2 text-[13.5px] font-medium", active(i.href) ? "text-ink" : "text-ink-muted hover:text-ink")}>{i.label}</Link>
        ))}
        <Link href="/book" className="ms-2 rounded-md bg-[#0e1b33] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#182a4b]">{bookLabel}</Link>
      </nav>
      <button type="button" className="ms-auto rounded-md p-2 md:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b border-line bg-surface p-4 shadow-md md:hidden">
          {items.map((i) => <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-surface-muted">{i.label}</Link>)}
          <Link href="/book" onClick={() => setOpen(false)} className="mt-2 block rounded-md bg-[#0e1b33] px-3 py-2.5 text-center text-[15px] font-semibold text-white">{bookLabel}</Link>
        </div>
      )}
    </>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/ui/layout";

export function WorkspaceTabs({ tabs, base, className }: { tabs: { key: string; href: string; label: string; count?: number }[]; base: string; className?: string }) {
  const pathname = usePathname();
  const rest = pathname.slice(base.length).split("/")[1] ?? "";
  const active = rest === "" || rest === "edit" ? "overview" : rest;
  return <LinkTabs tabs={tabs} active={active} className={className} />;
}

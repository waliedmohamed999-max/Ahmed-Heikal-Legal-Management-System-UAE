"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Kbd } from "@/components/ui/layout";
import { quickCreate } from "./bus";

/**
 * Two-key sequences (G C, N T…) plus ⌘K. Defined as data so they can become
 * user-configurable later without touching the handler.
 */
export const SHORTCUTS = [
  { keys: ["⌘/Ctrl", "K"], labelKey: "shortcuts.search" },
  { keys: ["N", "C"], labelKey: "shortcuts.newCase", seq: "nc", href: "/app/cases/new", perm: "matters.create" },
  { keys: ["N", "T"], labelKey: "shortcuts.newTask", seq: "nt", quick: "task" as const, perm: "tasks.manage" },
  { keys: ["G", "C"], labelKey: "shortcuts.goCases", seq: "gc", href: "/app/cases" },
  { keys: ["G", "D"], labelKey: "shortcuts.goDashboard", seq: "gd", href: "/app" },
  { keys: ["G", "A"], labelKey: "shortcuts.goAgenda", seq: "ga", href: "/app/agenda" },
  { keys: ["?"], labelKey: "shortcuts.help", seq: "?" },
];

function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function KeyboardShortcuts({ permissions }: { permissions: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const buf = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    const perms = new Set(permissions);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const k = e.key.toLowerCase();
      if (k === "?") {
        setHelp(true);
        return;
      }
      const prev = buf.current;
      if (prev && Date.now() - prev.at < 900) {
        const seq = prev.key + k;
        const s = SHORTCUTS.find((x) => x.seq === seq && (!x.perm || perms.has(x.perm)));
        buf.current = null;
        if (s) {
          e.preventDefault();
          if (s.href) router.push(s.href);
          else if (s.quick) quickCreate(s.quick);
        }
        return;
      }
      if (k === "g" || k === "n") buf.current = { key: k, at: Date.now() };
    };
    const onHelp = () => setHelp(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ahl:shortcuts", onHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ahl:shortcuts", onHelp);
    };
  }, [permissions, router]);

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent title={t("shortcuts.title")} size="sm">
        <ul className="divide-y divide-line">
          {SHORTCUTS.map((s) => (
            <li key={s.labelKey} className="flex items-center justify-between py-2 text-body">
              <span className="text-ink">{t(s.labelKey)}</span>
              <span className="flex gap-1" dir="ltr">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

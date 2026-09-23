"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { QuickType } from "@/components/shell/bus";

// Dialog forms are code-split: they load only when first opened.
const QuickDialogs = dynamic(() => import("./quick-dialogs").then((m) => m.QuickDialogs), { ssr: false });

export type QuickRequest = { type: QuickType; matterId?: string; date?: string };

/** Listens for `ahl:quick-create` events (sidebar +, ⌘K, shortcuts, page buttons) and opens the right form. */
export function QuickCreateHost({ permissions }: { permissions: string[] }) {
  const [req, setReq] = useState<QuickRequest | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReq((e as CustomEvent<QuickRequest>).detail);
    window.addEventListener("ahl:quick-create", on);
    return () => window.removeEventListener("ahl:quick-create", on);
  }, []);
  if (!req) return null;
  return <QuickDialogs request={req} permissions={permissions} onClose={() => setReq(null)} />;
}

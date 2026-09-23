"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quickCreate, type QuickType } from "@/components/shell/bus";

/** Server-component-friendly trigger for the global quick-create dialogs. */
export function QuickButton({ type, label, matterId, variant = "secondary", size = "sm" }: { type: QuickType; label: string; matterId?: string; variant?: "primary" | "secondary"; size?: "sm" | "md" }) {
  return (
    <Button variant={variant} size={size} onClick={() => quickCreate(type, matterId ? { matterId } : undefined)}>
      <Plus /> {label}
    </Button>
  );
}

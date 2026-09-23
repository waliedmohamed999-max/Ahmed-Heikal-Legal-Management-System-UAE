"use client";

import type { QuickRequest } from "./quick-create-host";

// Replaced by the full form set once module actions exist.
export function QuickDialogs({ onClose }: { request: QuickRequest; permissions: string[]; onClose: () => void }) {
  onClose();
  return null;
}

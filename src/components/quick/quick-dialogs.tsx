"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/overlay";
import type { QuickRequest } from "./quick-create-host";
import { AppointmentDialog, DeadlineDialog, HearingDialog, NoteDialog, TaskDialog } from "./forms";

/** Maps a quick-create request to the right dialog. Page-based creators are routed. */
export function QuickDialogs({ request, onClose }: { request: QuickRequest; permissions: string[]; onClose: () => void }) {
  const router = useRouter();
  const { type, matterId } = request;
  useEffect(() => {
    if (type === "case") { router.push("/app/cases/new"); onClose(); }
    if (type === "client") { router.push("/app/clients/new"); onClose(); }
    if (type === "invoice") { router.push(`/app/finance/invoices/new${matterId ? `?matter=${matterId}` : ""}`); onClose(); }
    if (type === "document") { router.push(matterId ? `/app/cases/${matterId}/documents?upload=1` : "/app/documents?upload=1"); onClose(); }
  }, [type, matterId, router, onClose]);

  const body =
    type === "hearing" ? <HearingDialog matterId={matterId} onDone={onClose} /> :
    type === "deadline" ? <DeadlineDialog matterId={matterId} onDone={onClose} /> :
    type === "appointment" ? <AppointmentDialog matterId={matterId} onDone={onClose} /> :
    type === "task" ? <TaskDialog matterId={matterId} onDone={onClose} /> :
    type === "note" ? <NoteDialog matterId={matterId} onDone={onClose} /> : null;
  if (!body) return null;
  return <Dialog open onOpenChange={(o) => !o && onClose()}>{body}</Dialog>;
}

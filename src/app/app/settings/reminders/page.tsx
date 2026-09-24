import { stringList, numberList } from "@/lib/json-lists";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { currentThresholds } from "@/server/services/admin";
import { channelStatus } from "@/server/services/channels";
import { RemindersForm } from "./form";

export default async function RemindersPage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const policies = await db.reminderPolicy.findMany({ where: { organizationId: ctx.org.id } });
  const types = ["HEARING", "DEADLINE", "APPOINTMENT", "TASK"] as const;
  return (
    <RemindersForm
      channels={channelStatus()}
      thresholds={currentThresholds(ctx.org.settings) as never}
      policies={types.map((st) => {
        const p = policies.find((x) => x.subjectType === st);
        return { subjectType: st, offsetsMinutes: numberList(p?.offsetsMinutes ?? []), channels: stringList(p?.channels ?? ["IN_APP"]) as never, notifyOwner: p?.notifyOwner ?? false, escalateBeforeMinutes: p?.escalateBeforeMinutes ?? null, enabled: p?.enabled ?? true };
      })}
    />
  );
}

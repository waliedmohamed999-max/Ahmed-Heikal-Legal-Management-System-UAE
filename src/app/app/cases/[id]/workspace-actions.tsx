"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, MoreHorizontal, Gavel, CheckSquare, CalendarClock, Upload, StickyNote, Archive, Lock, RotateCcw, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { useAction } from "@/components/forms";
import { quickCreate } from "@/components/shell/bus";
import { setCaseStatusAction } from "./workspace-server-actions";

export function WorkspaceActions({ matterId, status, caps }: { matterId: string; status: string; caps: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const has = (c: string) => caps.includes(c);
  const { run, pending } = useAction();
  const setStatus = (s: "CLOSED" | "ACTIVE" | "ARCHIVED") => run(() => setCaseStatusAction({ id: matterId, status: s }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() });
  const closed = status === "CLOSED" || status === "ARCHIVED";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {has("matters.edit") && (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/app/cases/${matterId}/edit`}>
            <Pencil /> {t("workspace.edit")}
          </Link>
        </Button>
      )}
      {has("ai.use") && (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/app/ai?matter=${matterId}&task=CASE_BRIEF`}>
            <Sparkles /> {t("ai.generateBrief")}
          </Link>
        </Button>
      )}
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" size="icon-sm" aria-label={t("common.more")} loading={pending}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          {has("hearings.manage") && <MenuItem onSelect={() => quickCreate("hearing", { matterId })}><Gavel /> {t("quick.newHearing")}</MenuItem>}
          {has("deadlines.manage") && <MenuItem onSelect={() => quickCreate("deadline", { matterId })}><CalendarClock /> {t("quick.newDeadline")}</MenuItem>}
          {has("tasks.manage") && <MenuItem onSelect={() => quickCreate("task", { matterId })}><CheckSquare /> {t("quick.newTask")}</MenuItem>}
          {has("documents.upload") && <MenuItem onSelect={() => quickCreate("document", { matterId })}><Upload /> {t("quick.uploadDocument")}</MenuItem>}
          {has("notes.create") && <MenuItem onSelect={() => quickCreate("note", { matterId })}><StickyNote /> {t("quick.newNote")}</MenuItem>}
          {has("matters.close") && (
            <>
              <MenuSeparator />
              {closed ? (
                <MenuItem onSelect={() => setStatus("ACTIVE")}><RotateCcw /> {t("workspace.reopen")}</MenuItem>
              ) : (
                <MenuItem onSelect={() => setStatus("CLOSED")}><Lock /> {t("workspace.close")}</MenuItem>
              )}
              {status !== "ARCHIVED" && <MenuItem onSelect={() => setStatus("ARCHIVED")}><Archive /> {t("workspace.archive")}</MenuItem>}
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, MoreHorizontal, Gavel, CheckSquare, CalendarClock, Upload, StickyNote, Archive, Lock, RotateCcw, Sparkles, CalendarPlus, ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { useAction } from "@/components/forms";
import { quickCreate } from "@/components/shell/bus";
import { setCaseStatusAction } from "./workspace-server-actions";

/** Case actions: Add task · Upload · Schedule ▾ · More ⋯ (icon-only on phones). */
export function WorkspaceActions({ matterId, status, caps }: { matterId: string; status: string; caps: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const has = (c: string) => caps.includes(c);
  const { run, pending } = useAction();
  const setStatus = (s: "CLOSED" | "ACTIVE" | "ARCHIVED") => run(() => setCaseStatusAction({ id: matterId, status: s }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() });
  const closed = status === "CLOSED" || status === "ARCHIVED";
  const canSchedule = has("hearings.manage") || has("deadlines.manage") || has("calendar.view");

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {has("tasks.manage") && (
        <Button variant="secondary" size="sm" onClick={() => quickCreate("task", { matterId })} aria-label={t("ws.addTask")}>
          <CheckSquare /> <span className="max-sm:hidden">{t("ws.addTask")}</span>
        </Button>
      )}
      {has("documents.upload") && (
        <Button variant="secondary" size="sm" onClick={() => quickCreate("document", { matterId })} aria-label={t("ws.upload")}>
          <Upload /> <span className="max-sm:hidden">{t("ws.upload")}</span>
        </Button>
      )}
      {canSchedule && (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="sm" aria-label={t("ws.schedule")}>
              <CalendarPlus /> <span className="max-sm:hidden">{t("ws.schedule")}</span> <ChevronDown className="max-sm:hidden" />
            </Button>
          </MenuTrigger>
          <MenuContent className="w-52">
            {has("hearings.manage") && <MenuItem onSelect={() => quickCreate("hearing", { matterId })}><Gavel /> {t("quick.newHearing")}</MenuItem>}
            {has("deadlines.manage") && <MenuItem onSelect={() => quickCreate("deadline", { matterId })}><CalendarClock /> {t("quick.newDeadline")}</MenuItem>}
            <MenuItem onSelect={() => quickCreate("appointment", { matterId })}><CalendarPlus /> {t("quick.newAppointment")}</MenuItem>
          </MenuContent>
        </Menu>
      )}
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("common.more")} loading={pending}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent className="w-56">
          {has("matters.edit") && (
            <MenuItem asChild>
              <Link href={`/app/cases/${matterId}/edit`}><Pencil /> {t("workspace.edit")}</Link>
            </MenuItem>
          )}
          {has("ai.use") && (
            <MenuItem asChild>
              <Link href={`/app/ai?matter=${matterId}&task=CASE_BRIEF`}><Sparkles /> {t("ai.generateBrief")}</Link>
            </MenuItem>
          )}
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

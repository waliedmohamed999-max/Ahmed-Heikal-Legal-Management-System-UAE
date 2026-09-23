"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog as D } from "radix-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Clock, AlertTriangle, Gavel, CalendarClock, CheckSquare, FileText, User, Wallet, Settings, MailOpen, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { SheetContent, Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/layout";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  requiresAck: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
};

const CAT_ICON: Record<string, LucideIcon> = {
  CRITICAL: AlertTriangle, DEADLINE: CalendarClock, HEARING: Gavel, TASK: CheckSquare, DOCUMENT: FileText, CLIENT: User, FINANCE: Wallet, SYSTEM: Settings,
};
const CAT_TONE: Record<string, string> = {
  CRITICAL: "text-critical bg-critical-soft", DEADLINE: "text-high bg-high-soft", HEARING: "text-ev-hearing bg-info-soft", TASK: "text-info bg-info-soft",
  DOCUMENT: "text-ink-muted bg-neutral-soft", CLIENT: "text-ev-client-meeting bg-neutral-soft", FINANCE: "text-success bg-success-soft", SYSTEM: "text-ink-muted bg-neutral-soft",
};
const CATS = ["ALL", "CRITICAL", "DEADLINE", "HEARING", "TASK", "DOCUMENT", "CLIENT", "FINANCE", "SYSTEM"];

async function act(body: Record<string, unknown>) {
  const r = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("failed");
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const count = useQuery({
    queryKey: ["notif-count"],
    queryFn: async () => ((await (await fetch("/api/notifications?count=1")).json()) as { unread: number }).unread,
    initialData: initialUnread,
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: ["notifs", cat, unreadOnly],
    enabled: open,
    queryFn: async () => {
      const r = await fetch(`/api/notifications?category=${cat}&unread=${unreadOnly ? 1 : 0}`);
      if (!r.ok) throw new Error("load failed");
      return (await r.json()) as { items: Notif[] };
    },
  });
  const m = useMutation({
    mutationFn: act,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifs"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
    },
  });

  const unread = count.data ?? 0;
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button type="button" className="relative rounded-md p-2 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label={`${t("notif.title")}${unread ? ` (${unread})` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-white tabular">{unread > 99 ? "99+" : unread}</span>
          )}
        </button>
      </D.Trigger>
      <SheetContent
        title={t("notif.title")}
        headerActions={
          <Button variant="ghost" size="xs" onClick={() => m.mutate({ action: "readAll" })} disabled={!unread}>
            <CheckCheck /> {t("notif.markAllRead")}
          </Button>
        }
      >
        <div className="sticky top-0 z-[1] border-b border-line bg-surface px-4 py-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
            {CATS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cn("shrink-0 rounded-md px-2 py-1 text-xs font-medium", cat === c ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-surface-muted")}
              >
                {c === "ALL" ? t("notif.all") : t(`enums.notificationCategory.${c}`)}
              </button>
            ))}
          </div>
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-[var(--accent)]" />
            {t("notif.unread")}
          </label>
        </div>
        {list.isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.isError ? (
          <EmptyState title={t("errors.network")} action={<Button size="sm" onClick={() => list.refetch()}>{t("common.retry")}</Button>} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Bell />} title={t("notif.empty")} />
        ) : (
          <ul className="divide-y divide-line">
            {list.data.items.map((n) => {
              const Icon = CAT_ICON[n.category] ?? Bell;
              return (
                <li key={n.id} className={cn("group relative flex gap-3 px-4 py-3", !n.readAt && "bg-accent-soft/40")}>
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", CAT_TONE[n.category])}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => {
                          setOpen(false);
                          if (!n.readAt) m.mutate({ action: "read", id: n.id });
                        }}
                        className="text-[13px] font-medium text-ink hover:underline"
                      >
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-[13px] font-medium text-ink">{n.title}</p>
                    )}
                    {n.body && <p className="ltr-nums mt-0.5 text-xs text-ink-muted">{n.body}</p>}
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-subtle">
                      <span>{relativeTime(n.createdAt, locale)}</span>
                      {n.requiresAck &&
                        (n.acknowledgedAt ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <Check className="size-3" /> {t("notif.acknowledged")}
                          </span>
                        ) : (
                          <button type="button" onClick={() => m.mutate({ action: "ack", id: n.id })} className="font-medium text-accent hover:underline">
                            {t("notif.acknowledge")}
                          </button>
                        ))}
                    </div>
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <button type="button" className="h-7 rounded px-1.5 text-ink-subtle opacity-0 hover:bg-surface-muted group-hover:opacity-100 focus:opacity-100" aria-label={t("common.actions")}>
                        ···
                      </button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => m.mutate({ action: n.readAt ? "unread" : "read", id: n.id })}>
                        <MailOpen /> {n.readAt ? t("notif.markUnread") : t("notif.markRead")}
                      </MenuItem>
                      <MenuItem onSelect={() => m.mutate({ action: "snooze", id: n.id, hours: 1 })}>
                        <Clock /> {t("notif.snooze")} · {t("notif.snooze1h")}
                      </MenuItem>
                      <MenuItem onSelect={() => m.mutate({ action: "snooze", id: n.id, tomorrow: true })}>
                        <Clock /> {t("notif.snooze")} · {t("notif.snoozeTomorrow")}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </D.Root>
  );
}

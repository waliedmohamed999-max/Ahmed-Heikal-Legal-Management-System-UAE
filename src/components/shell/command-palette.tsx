"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Users, FileText, CheckSquare, Contact, Receipt, Search, Loader2, CornerDownLeft, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { PRIMARY_NAV, MORE_NAV } from "./nav";
import { quickCreate, type QuickType } from "./bus";

type Hit = { id: string; title: string; subtitle?: string | null; href: string; snippet?: string | null };
type SearchResponse = { cases: Hit[]; clients: Hit[]; contacts: Hit[]; documents: Hit[]; tasks: Hit[]; invoices: Hit[] };

const GROUP_ICON: Record<keyof SearchResponse, LucideIcon> = {
  cases: Briefcase, clients: Users, contacts: Contact, documents: FileText, tasks: CheckSquare, invoices: Receipt,
};

function useDebounced<T>(v: T, ms = 160) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

export function CommandPalette({ permissions }: { permissions: string[] }) {
  const { t, dir } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const perms = new Set(permissions);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ahl:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ahl:command", onOpen);
    };
  }, []);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["search", dq],
    enabled: open && dq.length >= 2,
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}`, { signal });
      if (!r.ok) throw new Error("search failed");
      return (await r.json()) as SearchResponse;
    },
    staleTime: 10_000,
  });

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const quick = (type: QuickType, href?: string) => {
    setOpen(false);
    setQ("");
    if (href) router.push(href);
    else setTimeout(() => quickCreate(type), 50);
  };

  const commands: { label: string; perm: string; run: () => void; keywords: string }[] = [
    { label: t("quick.newCase"), perm: "matters.create", run: () => quick("case", "/app/cases/new"), keywords: "new matter case قضية" },
    { label: t("quick.newClient"), perm: "clients.create", run: () => quick("client", "/app/clients/new"), keywords: "add client عميل" },
    { label: t("quick.newTask"), perm: "tasks.manage", run: () => quick("task"), keywords: "create task مهمة" },
    { label: t("quick.newHearing"), perm: "hearings.manage", run: () => quick("hearing"), keywords: "schedule hearing جلسة" },
    { label: t("quick.newAppointment"), perm: "appointments.manage", run: () => quick("appointment"), keywords: "appointment meeting موعد" },
    { label: t("quick.newDeadline"), perm: "deadlines.manage", run: () => quick("deadline"), keywords: "deadline موعد نهائي" },
    { label: t("quick.uploadDocument"), perm: "documents.upload", run: () => quick("document"), keywords: "upload document contract مستند" },
    { label: t("quick.newInvoice"), perm: "finance.manage", run: () => quick("invoice", "/app/finance/invoices/new"), keywords: "invoice فاتورة" },
    { label: t("quick.newNote"), perm: "notes.create", run: () => quick("note"), keywords: "note ملاحظة" },
  ].filter((c) => perms.has(c.perm));

  const nav = [...PRIMARY_NAV, ...MORE_NAV].filter((n) => !n.perm || perms.has(n.perm));
  const groups = data ? (Object.keys(GROUP_ICON) as (keyof SearchResponse)[]).filter((g) => data[g]?.length) : [];

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-[#0c1424]/40 backdrop-blur-[2px]" />
        <D.Content className="fixed inset-x-3 top-[12vh] z-[60] mx-auto max-w-[640px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg outline-none" dir={dir}>
          <D.Title className="sr-only">{t("command.placeholder")}</D.Title>
          <D.Description className="sr-only">{t("command.hint")}</D.Description>
          <Command shouldFilter={dq.length < 2} loop className="flex flex-col" label={t("command.placeholder")}>
            <div className="flex items-center gap-2 border-b border-line px-4">
              {isFetching ? <Loader2 className="size-4 animate-spin text-ink-subtle" /> : <Search className="size-4 text-ink-subtle" />}
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder={t("command.placeholder")}
                className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle"
              />
            </div>
            <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-2 scrollbar-thin">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-muted">
                {isError ? t("errors.network") : isFetching ? t("command.searching") : t("command.empty")}
              </Command.Empty>

              {groups.map((g) => {
                const Icon = GROUP_ICON[g];
                return (
                  <Command.Group key={g} heading={t(`command.${g}`)} className={groupCls}>
                    {data![g].map((hit) => (
                      <Command.Item key={hit.id} value={`${g}-${hit.id}`} onSelect={() => go(hit.href)} className={itemCls}>
                        <Icon className="size-4 shrink-0 text-ink-subtle" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] text-ink">{hit.title}</div>
                          {(hit.subtitle || hit.snippet) && <div className="truncate text-xs text-ink-subtle">{hit.snippet ? `${t("command.matchedInText")}: “${hit.snippet}”` : hit.subtitle}</div>}
                        </div>
                        <CornerDownLeft className="hidden size-3.5 text-ink-subtle group-data-[selected=true]:block" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}

              {dq.length < 2 && (
                <>
                  <Command.Group heading={t("command.commands")} className={groupCls}>
                    {commands.map((c) => (
                      <Command.Item key={c.label} value={`${c.label} ${c.keywords}`} onSelect={c.run} className={itemCls}>
                        <span className="flex size-5 items-center justify-center rounded bg-surface-sunken text-[11px] text-ink-muted">+</span>
                        <span className="text-[13.5px]">{c.label}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading={t("command.navigation")} className={groupCls}>
                    {nav.map((n) => (
                      <Command.Item key={n.key} value={`go ${t(n.labelKey)} ${n.key}`} onSelect={() => go(n.href)} className={itemCls}>
                        <n.icon className="size-4 text-ink-subtle" />
                        <span className="text-[13.5px]">{t(n.labelKey)}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
            <div className="border-t border-line bg-surface-muted/60 px-4 py-2 text-[11.5px] text-ink-subtle">{t("command.hint")}</div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

const groupCls = "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-subtle";
const itemCls = "group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 data-[selected=true]:bg-surface-muted";

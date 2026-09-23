"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Dialog as D } from "radix-ui";
import {
  ChevronsLeft, ChevronsRight, Plus, Search, Menu as MenuIcon, LogOut, Moon, Sun, Languages, MoreHorizontal, User, Keyboard,
  Briefcase, UserPlus, CheckSquare, CalendarPlus, Gavel, Upload, Receipt, StickyNote, Home, CalendarDays, AlarmClock,
} from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Avatar, Kbd } from "@/components/ui/layout";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/overlay";
import { logoutAction, setLocaleAction } from "@/app/(auth)/actions";
import { PRIMARY_NAV, MORE_NAV, isActive, type NavItem } from "./nav";
import { NextHearingStrip, type NextHearingData } from "./next-hearing";
import { CommandPalette } from "./command-palette";
import { quickCreate, openCommandPalette, type QuickType } from "./bus";
import { NotificationBell } from "./notifications";
import { KeyboardShortcuts } from "./shortcuts";

export type ShellUser = { id: string; name: string; nameAr: string | null; email: string; photoUrl: string | null; position: string | null; positionAr: string | null; role: string };

const QUICK: { type: QuickType; labelKey: string; icon: React.ComponentType<{ className?: string }>; perm: string; href?: string }[] = [
  { type: "case", labelKey: "quick.newCase", icon: Briefcase, perm: "matters.create", href: "/app/cases/new" },
  { type: "client", labelKey: "quick.newClient", icon: UserPlus, perm: "clients.create", href: "/app/clients/new" },
  { type: "task", labelKey: "quick.newTask", icon: CheckSquare, perm: "tasks.manage" },
  { type: "appointment", labelKey: "quick.newAppointment", icon: CalendarPlus, perm: "appointments.manage" },
  { type: "hearing", labelKey: "quick.newHearing", icon: Gavel, perm: "hearings.manage" },
  { type: "deadline", labelKey: "quick.newDeadline", icon: AlarmClock, perm: "deadlines.manage" },
  { type: "document", labelKey: "quick.uploadDocument", icon: Upload, perm: "documents.upload" },
  { type: "invoice", labelKey: "quick.newInvoice", icon: Receipt, perm: "finance.manage", href: "/app/finance/invoices/new" },
  { type: "note", labelKey: "quick.newNote", icon: StickyNote, perm: "notes.create" },
];

function readCollapsed() {
  try {
    return localStorage.getItem("ahl-sidebar") === "collapsed";
  } catch {
    return false;
  }
}

export function AppShell({
  user,
  permissions,
  counts,
  nextHearing,
  isDemo,
  children,
}: {
  user: ShellUser;
  permissions: string[];
  counts: { unread: number; approvals: number };
  nextHearing: NextHearingData | null;
  isDemo: boolean;
  children: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const perms = new Set(permissions);
  const can = (p?: string) => !p || perms.has(p);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCollapsed(readCollapsed());
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("ahl-sidebar", next ? "collapsed" : "expanded");
    } catch {}
  };
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ahl-theme", next ? "dark" : "light");
    } catch {}
  };
  const switchLocale = () =>
    startTransition(async () => {
      await setLocaleAction(locale === "ar" ? "en" : "ar");
      router.refresh();
    });

  const quickItems = QUICK.filter((q) => can(q.perm));
  const runQuick = (q: (typeof QUICK)[number]) => (q.href ? router.push(q.href) : quickCreate(q.type));
  const displayName = locale === "ar" ? user.nameAr || user.name : user.name;
  const primary = PRIMARY_NAV.filter((n) => can(n.perm));
  const more = MORE_NAV.filter((n) => can(n.perm));
  const moreActive = more.some((n) => isActive(pathname, n.href));

  const sidebar = (mobile: boolean) => {
    const narrow = collapsed && !mobile;
    const NavLink = ({ item }: { item: NavItem }) => {
      const active = isActive(pathname, item.href);
      const badge = item.badge === "approvals" ? counts.approvals : 0;
      const link = (
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            active ? "bg-nav-active text-white" : "text-nav-fg/85 hover:bg-nav-surface hover:text-white",
            narrow && "justify-center px-0",
          )}
        >
          {active && <span aria-hidden className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-[var(--accent)]" />}
          <item.icon className={cn("size-4 shrink-0", active ? "text-white" : "text-nav-muted group-hover:text-nav-fg")} />
          {!narrow && <span className="truncate">{t(item.labelKey)}</span>}
          {badge > 0 && (
            <span className={cn("rounded bg-[var(--accent)] px-1.5 text-[10.5px] font-semibold leading-4 text-white tabular", narrow ? "absolute -end-0.5 -top-0.5 px-1" : "ms-auto")}>{badge}</span>
          )}
        </Link>
      );
      return narrow ? <Tooltip content={t(item.labelKey)} side={locale === "ar" ? "left" : "right"}>{link}</Tooltip> : link;
    };

    return (
      <div className="flex h-full flex-col bg-nav text-nav-fg">
        <div className={cn("flex h-14 items-center gap-2.5 px-3.5", narrow && "justify-center px-0")}>
          <Logo className="text-white" />
          {!narrow && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-semibold text-white">AH Legal OS</div>
              <div className="truncate text-[11px] text-nav-muted">{t("app.office")}</div>
            </div>
          )}
        </div>

        <div className={cn("flex flex-col gap-1.5 px-3 pb-3", narrow && "items-center px-2")}>
          <button
            type="button"
            onClick={openCommandPalette}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md border border-nav-line bg-nav-surface px-2.5 text-[13px] text-nav-muted transition-colors hover:border-nav-muted/40 hover:text-nav-fg",
              narrow && "size-8 justify-center px-0",
            )}
            aria-label={t("nav.searchPlaceholder")}
          >
            <Search className="size-4 shrink-0" />
            {!narrow && (
              <>
                <span className="flex-1 truncate text-start">{t("common.search")}</span>
                <Kbd className="border-nav-line bg-transparent text-nav-muted">⌘K</Kbd>
              </>
            )}
          </button>
          {quickItems.length > 0 && (
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md bg-white px-2.5 text-[13px] font-semibold text-[#0c1424] shadow-xs transition-colors hover:bg-white/90",
                    narrow && "size-8 justify-center px-0",
                  )}
                  aria-label={t("nav.quickCreate")}
                >
                  <Plus className="size-4" />
                  {!narrow && <span>{t("nav.quickCreate")}</span>}
                </button>
              </MenuTrigger>
              <MenuContent align="start" className="w-56">
                {quickItems.map((q) => (
                  <MenuItem key={q.type} onSelect={() => runQuick(q)}>
                    <q.icon />
                    {t(q.labelKey)}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          )}
        </div>

        <nav aria-label={t("nav.mainNavigation")} className={cn("nav-scroll flex-1 overflow-y-auto px-3", narrow && "px-2")}>
          <ul className="flex flex-col gap-0.5">
            {primary.map((item) => (
              <li key={item.key}>
                <NavLink item={item} />
              </li>
            ))}
            {more.length > 0 && (
              <li>
                <Menu>
                  <MenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                        moreActive ? "bg-nav-active text-white" : "text-nav-fg/85 hover:bg-nav-surface hover:text-white",
                        narrow && "justify-center px-0",
                      )}
                    >
                      <MoreHorizontal className="size-4 text-nav-muted" />
                      {!narrow && <span>{t("nav.more")}</span>}
                    </button>
                  </MenuTrigger>
                  <MenuContent align="start" className="w-60">
                    {more.map((n) => (
                      <MenuItem key={n.key} asChild>
                        <Link href={n.href}>
                          <n.icon />
                          {t(n.labelKey)}
                        </Link>
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              </li>
            )}
          </ul>
        </nav>

        <div className={cn("border-t border-nav-line p-2", narrow && "flex flex-col items-center")}>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className={cn("flex w-full items-center gap-2.5 rounded-md p-1.5 text-start hover:bg-nav-surface", narrow && "w-auto justify-center")}>
                <Avatar name={user.name} src={user.photoUrl} size={28} className="ring-nav" />
                {!narrow && (
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[13px] font-medium text-white">{displayName}</div>
                    <div className="truncate text-[11px] text-nav-muted">{user.role}</div>
                  </div>
                )}
              </button>
            </MenuTrigger>
            <MenuContent align="start" className="w-60">
              <MenuLabel>{user.email}</MenuLabel>
              <MenuItem asChild>
                <Link href="/app/settings/profile">
                  <User />
                  {t("nav.profile")}
                </Link>
              </MenuItem>
              <MenuItem onSelect={switchLocale}>
                <Languages />
                {t("common.switchLanguage")}
              </MenuItem>
              <MenuItem onSelect={toggleTheme}>
                {dark ? <Sun /> : <Moon />}
                {dark ? "Light" : "Dark"}
              </MenuItem>
              <MenuItem onSelect={() => window.dispatchEvent(new Event("ahl:shortcuts"))}>
                <Keyboard />
                {t("shortcuts.title")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => startTransition(() => logoutAction())}>
                <LogOut />
                {t("nav.signOut")}
              </MenuItem>
            </MenuContent>
          </Menu>
          {!mobile && (
            <button
              type="button"
              onClick={toggleCollapse}
              className={cn("mt-1 flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] text-nav-muted hover:bg-nav-surface hover:text-nav-fg", narrow && "w-7 justify-center px-0")}
              aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            >
              {(locale === "ar") !== collapsed ? <ChevronsLeft className="size-4" /> : <ChevronsRight className="size-4" />}
              {!narrow && <span>{t("nav.collapse")}</span>}
            </button>
          )}
        </div>
      </div>
    );
  };

  const TABS = [
    { href: "/app", icon: Home, label: t("nav.home") },
    { href: "/app/cases", icon: Briefcase, label: t("nav.cases") },
    { href: "/app/agenda", icon: CalendarDays, label: t("nav.agenda") },
    { href: "/app/my-work", icon: CheckSquare, label: t("nav.tasks") },
  ];

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 lg:block", collapsed ? "w-[60px]" : "w-[244px]")}>{sidebar(false)}</aside>

      {/* Mobile drawer */}
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
          <D.Content className="fixed inset-y-0 start-0 z-50 w-[82%] max-w-[300px] outline-none lg:hidden">
            <D.Title className="sr-only">{t("nav.mainNavigation")}</D.Title>
            <D.Description className="sr-only">{t("nav.mainNavigation")}</D.Description>
            {sidebar(true)}
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo && <div className="bg-[#0c1424] px-4 py-1 text-center text-[11.5px] text-nav-muted">{t("app.demoBanner")}</div>}
        <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
          <div className="flex h-[52px] items-center gap-2 px-3 sm:px-5">
            <button type="button" onClick={() => setMobileOpen(true)} className="-ms-1 rounded-md p-2 text-ink-muted hover:bg-surface-muted lg:hidden" aria-label={t("nav.openMenu")}>
              <MenuIcon className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <NextHearingStrip data={nextHearing} />
            </div>
            <button type="button" onClick={openCommandPalette} className="rounded-md p-2 text-ink-muted hover:bg-surface-muted hover:text-ink lg:hidden" aria-label={t("common.search")}>
              <Search className="size-[18px]" />
            </button>
            <button type="button" onClick={switchLocale} className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-muted hover:bg-surface-muted hover:text-ink sm:inline-flex" aria-label={t("common.switchLanguageLabel")}>
              <Languages className="size-4" />
              {t("common.switchLanguage")}
            </button>
            <NotificationBell initialUnread={counts.unread} />
          </div>
        </header>
        <main id="main" className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t("nav.mainNavigation")}>
          {TABS.slice(0, 2).map((tab) => (
            <MobileTab key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
          ))}
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="flex flex-col items-center justify-center" aria-label={t("nav.quickCreate")}>
                <span className="flex size-10 items-center justify-center rounded-full bg-brand text-brand-fg shadow-md">
                  <Plus className="size-5" />
                </span>
              </button>
            </MenuTrigger>
            <MenuContent align="center" className="mb-2 w-60">
              {quickItems.map((q) => (
                <MenuItem key={q.type} onSelect={() => runQuick(q)} className="py-2.5">
                  <q.icon />
                  {t(q.labelKey)}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          {TABS.slice(2).map((tab) => (
            <MobileTab key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
          ))}
        </nav>
      </div>

      <CommandPalette permissions={permissions} />
      <KeyboardShortcuts permissions={permissions} />
    </div>
  );
}

function MobileTab({ href, icon: Icon, label, active }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium", active ? "text-ink" : "text-ink-subtle")}>
      <Icon className={cn("size-5", active && "text-accent")} />
      {label}
    </Link>
  );
}

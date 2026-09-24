"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog as D } from "radix-ui";
import {
  PanelLeftClose, PanelLeftOpen, Plus, Search, LogOut, Moon, Sun, Languages, MoreHorizontal, User, Keyboard, ChevronDown,
  Briefcase, UserPlus, CheckSquare, CalendarPlus, Gavel, Upload, Receipt, StickyNote, AlarmClock, X,
} from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Avatar, Kbd } from "@/components/ui/layout";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/overlay";
import { logoutAction, setLocaleAction } from "@/app/(auth)/actions";
import { PRIMARY_NAV, TOOLS_NAV, MORE_NAV, MOBILE_NAV, isActive, currentSection, type NavItem } from "./nav";
import { NextHearingMini, NextHearingChip, type NextHearingData } from "./next-hearing";
import { CommandPalette } from "./command-palette";
import { quickCreate, openCommandPalette, type QuickType } from "./bus";
import { NotificationBell } from "./notifications";
import { KeyboardShortcuts } from "./shortcuts";

export type ShellUser = { id: string; name: string; nameAr: string | null; email: string; photoUrl: string | null; position: string | null; positionAr: string | null; role: string };

const QUICK: { type: QuickType; labelKey: string; icon: React.ComponentType<{ className?: string }>; perm: string; href?: string }[] = [
  { type: "case", labelKey: "quick.newCase", icon: Briefcase, perm: "matters.create", href: "/app/cases/new" },
  { type: "client", labelKey: "quick.newClient", icon: UserPlus, perm: "clients.create", href: "/app/clients/new" },
  { type: "task", labelKey: "quick.newTask", icon: CheckSquare, perm: "tasks.manage" },
  { type: "hearing", labelKey: "quick.newHearing", icon: Gavel, perm: "hearings.manage" },
  { type: "deadline", labelKey: "quick.newDeadline", icon: AlarmClock, perm: "deadlines.manage" },
  { type: "appointment", labelKey: "quick.newAppointment", icon: CalendarPlus, perm: "appointments.manage" },
  { type: "document", labelKey: "quick.uploadDocument", icon: Upload, perm: "documents.upload" },
  { type: "invoice", labelKey: "quick.newInvoice", icon: Receipt, perm: "finance.manage", href: "/app/finance/invoices/new" },
  { type: "note", labelKey: "quick.newNote", icon: StickyNote, perm: "notes.create" },
];

/** Non-sensitive display preferences, kept in cookies so the server renders them (no flicker). */
function savePref(name: "ahl_theme" | "ahl_sidebar", value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function AppShell({
  user,
  permissions,
  counts,
  nextHearing,
  isDemo,
  prefs,
  children,
}: {
  user: ShellUser;
  permissions: string[];
  counts: { unread: number; approvals: number };
  nextHearing: NextHearingData | null;
  isDemo: boolean;
  prefs: { dark: boolean; collapsed: boolean };
  children: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const perms = new Set(permissions);
  const can = (p?: string) => !p || perms.has(p);
  const [collapsed, setCollapsed] = useState(prefs.collapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(prefs.dark);
  const [, startTransition] = useTransition();

  // Close the mobile menu on navigation (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    savePref("ahl_sidebar", next ? "collapsed" : "expanded");
  };
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    savePref("ahl_theme", next ? "dark" : "light");
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
  const tools = TOOLS_NAV.filter((n) => can(n.perm));
  const more = MORE_NAV.filter((n) => can(n.perm));
  const section = currentSection(pathname);
  const badgeFor = (item: NavItem) => (item.badge === "approvals" ? counts.approvals : 0);

  return (
    <div className="flex min-h-dvh bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Sidebar: icon rail on tablet, full (collapsible) on desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-e border-line bg-canvas transition-[width] duration-200 md:block",
          collapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w-collapsed)] xl:w-[var(--sidebar-w)]",
        )}
      >
        <Sidebar
          narrowAlways={collapsed}
          collapsed={collapsed}
          primary={primary}
          tools={tools}
          more={more}
          pathname={pathname}
          badgeFor={badgeFor}
          nextHearing={nextHearing}
          onToggle={toggleCollapse}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: section · search · new · notifications · profile */}
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          <div className="flex h-12 items-center gap-2 px-3 sm:px-4 xl:px-6">
            <Link href="/app" className="md:hidden" aria-label={t("nav.home")}>
              <Logo size={26} className="text-brand" />
            </Link>
            {section && (
              <div className="flex min-w-0 items-center gap-2 text-body">
                <section.icon className="hidden size-4 shrink-0 text-ink-subtle sm:block" />
                <Link href={section.href} className="truncate font-medium text-ink hover:underline">
                  {t(section.labelKey)}
                </Link>
              </div>
            )}
            {isDemo && (
              <Tooltip content={t("shell.demoHint")}>
                <span className="hidden shrink-0 rounded-sm border border-warning/30 bg-warning-soft px-1.5 text-caption font-medium leading-[18px] text-warning sm:inline">{t("shell.demo")}</span>
              </Tooltip>
            )}

            <div className="ms-auto flex items-center gap-1.5">
              <NextHearingChip data={nextHearing} className="xl:hidden" />
              <button
                type="button"
                onClick={openCommandPalette}
                className="hidden h-8 w-64 items-center gap-2 rounded-md border border-line bg-surface-muted px-2.5 text-body text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted md:flex xl:w-80"
              >
                <Search className="size-3.5 shrink-0" />
                <span className="flex-1 truncate text-start">{t("shell.searchLaunch")}</span>
                <Kbd>⌘K</Kbd>
              </button>
              <button type="button" onClick={openCommandPalette} className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink md:hidden" aria-label={t("common.search")}>
                <Search className="size-4" />
              </button>
              {quickItems.length > 0 && (
                <Menu>
                  <MenuTrigger asChild>
                    <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-2.5 text-body font-medium text-brand-fg transition-colors hover:bg-brand-hover max-sm:w-8 max-sm:justify-center max-sm:px-0" aria-label={t("nav.quickCreate")}>
                      <Plus className="size-4" />
                      <span className="max-sm:hidden">{t("shell.new")}</span>
                    </button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-56">
                    {quickItems.map((q) => (
                      <MenuItem key={q.type} onSelect={() => runQuick(q)}>
                        <q.icon />
                        {t(q.labelKey)}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              )}
              <NotificationBell initialUnread={counts.unread} />
              <Menu>
                <MenuTrigger asChild>
                  <button type="button" className="ms-0.5 rounded-full outline-offset-2" aria-label={t("shell.account")}>
                    <Avatar name={user.name} src={user.photoUrl} size={28} />
                  </button>
                </MenuTrigger>
                <MenuContent align="end" className="w-64">
                  <div className="flex items-center gap-2.5 px-2 py-2">
                    <Avatar name={user.name} src={user.photoUrl} size={32} />
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-body font-medium text-ink">{displayName}</div>
                      <div className="truncate text-meta text-ink-subtle">{user.role} · {user.email}</div>
                    </div>
                  </div>
                  <MenuSeparator />
                  <MenuItem asChild>
                    <Link href="/app/settings/profile">
                      <User />
                      {t("nav.profile")}
                    </Link>
                  </MenuItem>
                  <MenuItem onSelect={switchLocale}>
                    <Languages />
                    <span className="flex-1">{t("shell.language")}</span>
                    <span className="text-meta text-ink-subtle">{t("common.switchLanguage")}</span>
                  </MenuItem>
                  <MenuItem onSelect={toggleTheme}>
                    {dark ? <Sun /> : <Moon />}
                    <span className="flex-1">{t("shell.theme")}</span>
                    <span className="text-meta text-ink-subtle">{dark ? t("shell.light") : t("shell.dark")}</span>
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
            </div>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation: Home · Cases · Calendar · Tasks · More */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label={t("nav.mainNavigation")}>
        {MOBILE_NAV.map((n) => (
          <MobileTab key={n.key} href={n.href} icon={n.icon} label={t(n.labelKey)} active={isActive(pathname, n.href, n.match)} />
        ))}
        <button type="button" onClick={() => setMobileOpen(true)} className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-medium", mobileOpen ? "text-ink" : "text-ink-subtle")}>
          <MoreHorizontal className="size-5" />
          {t("nav.more")}
        </button>
      </nav>

      {/* Mobile "More" sheet — the rest of the navigation */}
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-[#0d1220]/35 data-[state=open]:animate-fade-in md:hidden" />
          <D.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] outline-none data-[state=open]:animate-slide-up md:hidden">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
              <D.Title className="text-heading font-semibold">{t("nav.more")}</D.Title>
              <D.Description className="sr-only">{t("nav.mainNavigation")}</D.Description>
              <D.Close className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted" aria-label="Close">
                <X className="size-4" />
              </D.Close>
            </div>
            <div className="grid grid-cols-3 gap-1 p-3">
              {[...primary.filter((n) => !MOBILE_NAV.includes(n)), ...tools, ...more].map((n) => {
                const on = isActive(pathname, n.href, n.match);
                const b = badgeFor(n);
                return (
                  <Link key={n.key} href={n.href} className={cn("relative flex flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-center text-meta", on ? "bg-surface-sunken text-ink" : "text-ink-muted hover:bg-surface-muted")}>
                    <n.icon className="size-5" />
                    <span className="line-clamp-2 leading-tight">{t(n.labelKey)}</span>
                    {b > 0 && <span className="absolute end-2 top-2 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-fg">{b}</span>}
                  </Link>
                );
              })}
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>

      <CommandPalette permissions={permissions} />
      <KeyboardShortcuts permissions={permissions} />
    </div>
  );
}

// ─────────────────────────── Sidebar ───────────────────────────
function Sidebar({
  narrowAlways,
  collapsed,
  primary,
  tools,
  more,
  pathname,
  badgeFor,
  nextHearing,
  onToggle,
}: {
  narrowAlways: boolean;
  collapsed: boolean;
  primary: NavItem[];
  tools: NavItem[];
  more: NavItem[];
  pathname: string;
  badgeFor: (n: NavItem) => number;
  nextHearing: NextHearingData | null;
  onToggle: () => void;
}) {
  const { t, locale } = useI18n();
  const moreActive = more.some((n) => isActive(pathname, n.href, n.match));
  const [moreOpen, setMoreOpen] = useState(moreActive);
  const moreBadge = more.reduce((s, n) => s + badgeFor(n), 0);
  // Labels show on lg+ unless collapsed; the tablet (md) rail is icons only.
  const label = narrowAlways ? "hidden" : "hidden xl:inline";
  const side = locale === "ar" ? "left" : "right";

  const navItem = (n: NavItem) => {
    const on = isActive(pathname, n.href, n.match);
    const b = badgeFor(n);
    const link = (
      <Link
        href={n.href}
        aria-current={on ? "page" : undefined}
        aria-label={t(n.labelKey)}
        className={cn(
          "group relative flex h-8 items-center justify-center gap-2.5 rounded-md text-body transition-colors duration-150",
          !narrowAlways && "xl:justify-start xl:px-2.5",
          on ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-line" : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
        )}
      >
        {on && <span aria-hidden className="absolute start-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
        <n.icon className={cn("size-4 shrink-0", on ? "text-ink" : "text-ink-subtle group-hover:text-ink-muted")} />
        <span className={cn("truncate", label)}>{t(n.labelKey)}</span>
        {b > 0 && (
          <span className={cn("absolute -top-0.5 end-0.5 rounded-sm bg-accent px-1 text-[10.5px] font-semibold leading-4 text-accent-fg tabular", !narrowAlways && "xl:static xl:ms-auto")}>{b}</span>
        )}
      </Link>
    );
    return (
      <li key={n.key}>
        {narrowAlways ? (
          <Tooltip content={t(n.labelKey)} side={side}>
            {link}
          </Tooltip>
        ) : (
          link
        )}
      </li>
    );
  };

  const moreMenu = (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={cn("relative flex h-8 w-full items-center justify-center rounded-md transition-colors hover:bg-surface-sunken", moreActive ? "text-ink" : "text-ink-subtle")} aria-label={t("nav.more")}>
          <MoreHorizontal className="size-4" />
          {moreBadge > 0 && <span className="absolute -top-0.5 end-0.5 rounded-sm bg-accent px-1 text-[10.5px] font-semibold leading-4 text-accent-fg">{moreBadge}</span>}
        </button>
      </MenuTrigger>
      <MenuContent align="start" side={side} className="w-56">
        {more.map((n) => (
          <MenuItem key={n.key} asChild>
            <Link href={n.href}>
              <n.icon />
              <span className="flex-1">{t(n.labelKey)}</span>
              {badgeFor(n) > 0 && <span className="text-meta font-semibold text-accent">{badgeFor(n)}</span>}
            </Link>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 shrink-0 items-center px-4", narrowAlways ? "justify-center px-0" : "max-xl:justify-center max-xl:px-0")}>
        <Link href="/app" className="flex min-w-0 items-center gap-2.5" aria-label={t("nav.home")}>
          <Logo size={26} className="text-brand" />
          <div className={cn("min-w-0 leading-tight", label)}>
            <div className="truncate text-body font-semibold text-ink">AH Legal OS</div>
            <div className="truncate text-caption text-ink-subtle">{t("app.office")}</div>
          </div>
        </Link>
      </div>

      <nav aria-label={t("nav.mainNavigation")} className={cn("relative flex-1 overflow-y-auto scrollbar-none px-3 pb-3 pt-2", narrowAlways ? "px-2" : "max-xl:px-2")}>
        <ul className="flex flex-col gap-0.5">{primary.map(navItem)}</ul>
        {tools.length > 0 && (
          <>
            <div className="mx-2 my-3 h-px bg-line" />
            <ul className="flex flex-col gap-0.5">{tools.map(navItem)}</ul>
          </>
        )}
        {more.length > 0 && (
          <>
            <div className="mx-2 my-3 h-px bg-line" />
            {narrowAlways ? (
              moreMenu
            ) : (
              <>
                <div className="xl:hidden">{moreMenu}</div>
                <div className="hidden xl:block">
                  <button
                    type="button"
                    onClick={() => setMoreOpen((o) => !o)}
                    aria-expanded={moreOpen}
                    className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-body text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                  >
                    <MoreHorizontal className="size-4 text-ink-subtle" />
                    <span className="flex-1 text-start">{t("nav.more")}</span>
                    {!moreOpen && moreBadge > 0 && <span className="rounded-sm bg-accent px-1 text-[10.5px] font-semibold leading-4 text-accent-fg">{moreBadge}</span>}
                    <ChevronDown className={cn("size-3.5 text-ink-subtle transition-transform duration-150", moreOpen && "rotate-180")} />
                  </button>
                  {moreOpen && <ul className="mt-0.5 flex flex-col gap-0.5">{more.map(navItem)}</ul>}
                </div>
              </>
            )}
          </>
        )}
      </nav>

      <div className={cn("shrink-0 space-y-2 border-t border-line p-3", narrowAlways ? "px-2" : "max-xl:px-2")}>
        {narrowAlways ? (
          <NextHearingMini data={nextHearing} narrow />
        ) : (
          <>
            <div className="hidden xl:block">
              <NextHearingMini data={nextHearing} />
            </div>
            <div className="xl:hidden">
              <NextHearingMini data={nextHearing} narrow />
            </div>
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={cn("hidden h-7 w-full items-center gap-2 rounded-md px-2 text-meta text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink xl:flex", narrowAlways && "justify-center px-0")}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {collapsed ? <PanelLeftOpen className="size-4 rtl:-scale-x-100" /> : <PanelLeftClose className="size-4 rtl:-scale-x-100" />}
          {!narrowAlways && <span>{t("nav.collapse")}</span>}
        </button>
      </div>
    </div>
  );
}

function MobileTab({ href, icon: Icon, label, active }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-ink" : "text-ink-subtle")}>
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

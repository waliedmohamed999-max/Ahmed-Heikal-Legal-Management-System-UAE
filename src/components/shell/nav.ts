import {
  Home, Briefcase, Users, CalendarDays, FileText, CheckSquare, Wallet, UsersRound, Sparkles, ShieldCheck,
  BarChart3, BookOpen, FileStack, Plug, Settings, ScrollText, Globe, Target, CalendarClock, Landmark, Contact, Sun, FileInput, CalendarCheck,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavItem = {
  key: string;
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: PermissionKey;
  badge?: "approvals";
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
};

/** Workspace — the seven places people live in all day. */
export const PRIMARY_NAV: NavItem[] = [
  { key: "home", href: "/app", labelKey: "nav.home", icon: Home },
  { key: "cases", href: "/app/cases", labelKey: "nav.cases", icon: Briefcase, perm: "matters.view", match: ["/app/hearings"] },
  { key: "clients", href: "/app/clients", labelKey: "nav.clients", icon: Users, perm: "clients.view" },
  { key: "calendar", href: "/app/calendar", labelKey: "nav.calendar", icon: CalendarDays, perm: "calendar.view", match: ["/app/agenda", "/app/planner"] },
  { key: "documents", href: "/app/documents", labelKey: "nav.documents", icon: FileText, perm: "documents.view" },
  { key: "tasks", href: "/app/my-work", labelKey: "nav.tasks", icon: CheckSquare, perm: "tasks.view", match: ["/app/tasks"] },
  { key: "finance", href: "/app/finance", labelKey: "nav.finance", icon: Wallet, perm: "finance.view" },
];

/** Intelligence. */
export const TOOLS_NAV: NavItem[] = [
  { key: "ai", href: "/app/ai", labelKey: "nav.ai", icon: Sparkles, perm: "ai.use" },
  { key: "reports", href: "/app/reports", labelKey: "nav.reports", icon: BarChart3, perm: "reports.view" },
];

/** Everything else — collapsed under "More" so the sidebar stays short. */
export const MORE_NAV: NavItem[] = [
  { key: "team", href: "/app/team", labelKey: "nav.team", icon: UsersRound, perm: "team.view" },
  { key: "approvals", href: "/app/approvals", labelKey: "nav.approvals", icon: ShieldCheck, perm: "approvals.view", badge: "approvals" },
  { key: "knowledge", href: "/app/knowledge", labelKey: "nav.knowledge", icon: BookOpen, perm: "knowledge.view" },
  { key: "templates", href: "/app/templates", labelKey: "nav.templates", icon: FileStack, perm: "knowledge.view" },
  { key: "crm", href: "/app/crm", labelKey: "nav.crm", icon: Target, perm: "crm.view" },
  { key: "contacts", href: "/app/contacts", labelKey: "nav.contacts", icon: Contact, perm: "contacts.view" },
  { key: "agenda", href: "/app/agenda", labelKey: "nav.agenda", icon: Sun, perm: "calendar.view" },
  { key: "planner", href: "/app/planner", labelKey: "nav.planner", icon: CalendarClock, perm: "calendar.view" },
  { key: "appointments", href: "/app/appointments", labelKey: "nav.appointments", icon: CalendarCheck, perm: "calendar.view" },
  { key: "court-import", href: "/app/integrations/import", labelKey: "courtImport.title", icon: FileInput, perm: "deadlines.manage" },
  { key: "resources", href: "/app/resources", labelKey: "nav.resources", icon: Landmark },
  { key: "integrations", href: "/app/integrations", labelKey: "nav.integrations", icon: Plug, perm: "integrations.manage" },
  { key: "website", href: "/app/website", labelKey: "nav.website", icon: Globe, perm: "cms.manage" },
  { key: "audit", href: "/app/audit", labelKey: "nav.audit", icon: ScrollText, perm: "audit.view" },
  { key: "settings", href: "/app/settings", labelKey: "nav.settings", icon: Settings, perm: "settings.manage" },
];

/** Mobile bottom navigation (the fifth slot is "More", which opens the full menu). */
export const MOBILE_NAV: NavItem[] = [
  PRIMARY_NAV[0],
  PRIMARY_NAV[1],
  PRIMARY_NAV[3],
  PRIMARY_NAV[5],
];

export const ALL_NAV = [...PRIMARY_NAV, ...TOOLS_NAV, ...MORE_NAV];

export function isActive(pathname: string, href: string, match?: string[]) {
  if (href === "/app") return pathname === "/app";
  const hit = (p: string) => pathname === p || pathname.startsWith(p + "/");
  // /app/integrations must not light up for /app/integrations/import (its own item)
  if (href === "/app/integrations" && pathname.startsWith("/app/integrations/import")) return false;
  return hit(href) || !!match?.some(hit);
}

/** The nav item that owns the current path (for the top-bar breadcrumb). */
export function currentSection(pathname: string) {
  return [...ALL_NAV].sort((a, b) => b.href.length - a.href.length).find((n) => isActive(pathname, n.href, n.match)) ?? null;
}

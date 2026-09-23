import {
  Home, Briefcase, Users, CalendarDays, FileText, CheckSquare, Wallet, UsersRound, Sparkles, ShieldCheck,
  BarChart3, BookOpen, FileStack, Plug, Settings, ScrollText, Globe, Target, CalendarClock, Landmark, Contact, ListTodo, Sun, FileInput,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavItem = {
  key: string;
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: PermissionKey;
  badge?: "approvals";
};

/** Compact primary navigation (per brief: few items, the rest under "More"). */
export const PRIMARY_NAV: NavItem[] = [
  { key: "home", href: "/app", labelKey: "nav.home", icon: Home },
  { key: "agenda", href: "/app/agenda", labelKey: "nav.agenda", icon: Sun },
  { key: "cases", href: "/app/cases", labelKey: "nav.cases", icon: Briefcase, perm: "matters.view" },
  { key: "clients", href: "/app/clients", labelKey: "nav.clients", icon: Users, perm: "clients.view" },
  { key: "calendar", href: "/app/calendar", labelKey: "nav.calendar", icon: CalendarDays, perm: "calendar.view" },
  { key: "documents", href: "/app/documents", labelKey: "nav.documents", icon: FileText, perm: "documents.view" },
  { key: "tasks", href: "/app/my-work", labelKey: "nav.tasks", icon: CheckSquare, perm: "tasks.view" },
  { key: "approvals", href: "/app/approvals", labelKey: "nav.approvals", icon: ShieldCheck, perm: "approvals.view", badge: "approvals" },
  { key: "finance", href: "/app/finance", labelKey: "nav.finance", icon: Wallet, perm: "finance.view" },
  { key: "team", href: "/app/team", labelKey: "nav.team", icon: UsersRound, perm: "team.view" },
  { key: "ai", href: "/app/ai", labelKey: "nav.ai", icon: Sparkles, perm: "ai.use" },
];

export const MORE_NAV: NavItem[] = [
  { key: "planner", href: "/app/planner", labelKey: "nav.planner", icon: CalendarClock, perm: "calendar.view" },
  { key: "tasks-all", href: "/app/tasks", labelKey: "nav.tasks", icon: ListTodo, perm: "tasks.view" },
  { key: "contacts", href: "/app/contacts", labelKey: "nav.contacts", icon: Contact, perm: "contacts.view" },
  { key: "crm", href: "/app/crm", labelKey: "nav.crm", icon: Target, perm: "crm.view" },
  { key: "appointments", href: "/app/appointments", labelKey: "nav.appointments", icon: CalendarDays, perm: "calendar.view" },
  { key: "reports", href: "/app/reports", labelKey: "nav.reports", icon: BarChart3, perm: "reports.view" },
  { key: "knowledge", href: "/app/knowledge", labelKey: "nav.knowledge", icon: BookOpen, perm: "knowledge.view" },
  { key: "templates", href: "/app/templates", labelKey: "nav.templates", icon: FileStack, perm: "knowledge.view" },
  { key: "resources", href: "/app/resources", labelKey: "nav.resources", icon: Landmark },
  { key: "court-import", href: "/app/integrations/import", labelKey: "courtImport.title", icon: FileInput, perm: "deadlines.manage" },
  { key: "integrations", href: "/app/integrations", labelKey: "nav.integrations", icon: Plug, perm: "integrations.manage" },
  { key: "website", href: "/app/website", labelKey: "nav.website", icon: Globe, perm: "cms.manage" },
  { key: "audit", href: "/app/audit", labelKey: "nav.audit", icon: ScrollText, perm: "audit.view" },
  { key: "settings", href: "/app/settings", labelKey: "nav.settings", icon: Settings, perm: "settings.manage" },
];

export function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

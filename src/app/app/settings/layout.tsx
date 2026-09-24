import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { Page, PageHeader } from "@/components/ui/layout";
import { SettingsNav } from "./nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const { t } = await getT();
  const items = [
    { href: "/app/settings/profile", key: "profile", show: true },
    { href: "/app/settings/office", key: "office", show: ctx.can("settings.manage") },
    { href: "/app/settings/users", key: "users", show: ctx.can("team.manage") },
    { href: "/app/settings/roles", key: "roles", show: ctx.can("roles.manage") },
    { href: "/app/settings/jurisdictions", key: "jurisdictions", show: ctx.can("settings.manage") },
    { href: "/app/settings/case-types", key: "caseTypes", show: ctx.can("settings.manage") },
    { href: "/app/settings/checklists", key: "checklists", show: ctx.can("settings.manage") },
    { href: "/app/settings/reminders", key: "reminders", show: ctx.can("settings.manage") },
    { href: "/app/settings/automations", key: "automations", show: ctx.can("settings.manage") },
    { href: "/app/settings/ai", key: "ai", show: ctx.can("settings.manage") },
    { href: "/app/settings/privacy", key: "privacy", show: ctx.can("privacy.manage") },
    { href: "/app/settings/backups", key: "backups", show: ctx.can("backups.view") },
    { href: "/app/integrations", key: "integrations", show: ctx.can("integrations.manage") },
    { href: "/app/audit", key: "audit", show: ctx.can("audit.view") },
    { href: "/app/website", key: "website", show: ctx.can("cms.manage") },
  ].filter((i) => i.show).map((i) => ({ href: i.href, label: t(`settings.nav.${i.key}`) }));
  return (
    <Page width="default" className="max-w-[1200px]">
      <PageHeader title={t("settings.title")} />
      <div className="mt-5 grid items-start gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsNav items={items} />
        <div className="min-w-0 max-w-[880px]">{children}</div>
      </div>
    </Page>
  );
}

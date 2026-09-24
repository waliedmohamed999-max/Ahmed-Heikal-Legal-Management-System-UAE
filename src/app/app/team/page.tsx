import Link from "next/link";
import { notFound } from "next/navigation";
import { UsersRound, Settings } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { teamWorkload } from "@/server/services/dashboard";
import { db } from "@/server/db";
import { Page, PageHeader, Avatar, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Team" };

/** Team as a list with descriptive workload indicators — never a score or ranking. */
export default async function TeamPage() {
  const ctx = await requireStaff();
  if (!ctx.can("team.view")) notFound();
  const { t, locale } = await getT();
  const [workload, users] = await Promise.all([
    teamWorkload(ctx),
    db.user.findMany({ where: { organizationId: ctx.org.id, kind: "STAFF", status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, include: { role: { select: { name: true, nameAr: true } } } }),
  ]);
  const wl = new Map((workload ?? []).map((w) => [w.id, w]));
  const max = Math.max(1, ...(workload ?? []).map((w) => w.activeMatters + w.openTasks));
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);

  return (
    <Page width="full" className="max-w-[1320px]">
      <PageHeader
        title={<span className="flex items-baseline gap-2">{t("team.title")}<span className="text-body font-normal tabular text-ink-subtle">{users.length}</span></span>}
        subtitle={t("team.workloadNote")}
        actions={ctx.can("team.manage") && <Button asChild variant="secondary"><Link href="/app/settings/users"><Settings /> {t("team.manage")}</Link></Button>}
      />

      <div className="-mx-4 mt-5 border-y border-line sm:mx-0 sm:rounded-lg sm:border">
        {users.length === 0 ? (
          <EmptyState icon={<UsersRound />} title="—" />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>{t("common.name")}</TH>
                    <TH>{t("shell.role")}</TH>
                    <TH className="text-end">{t("team.activeMatters")}</TH>
                    <TH className="text-end">{t("team.hearings")}</TH>
                    <TH className="text-end">{t("team.openTasks")}</TH>
                    <TH className="text-end">{t("team.urgent")}</TH>
                    <TH className="w-40">{t("team.workload")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {users.map((u) => {
                    const w = wl.get(u.id);
                    const load = w ? w.activeMatters + w.openTasks : 0;
                    return (
                      <TR key={u.id}>
                        <TD className="py-1.5">
                          <Link href={`/app/team/${u.id}`} className="group/link flex items-center gap-2.5">
                            <Avatar name={u.name} src={u.photoUrl} size={28} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink group-hover/link:underline">{L(u.name, u.nameAr)}</span>
                              <span className="block truncate text-meta text-ink-subtle">{L(u.position ?? "", u.positionAr)}</span>
                            </span>
                          </Link>
                        </TD>
                        <TD className="text-ink-muted">{L(u.role.name, u.role.nameAr)}</TD>
                        <TD className="text-end tabular text-ink">{w?.activeMatters ?? 0}</TD>
                        <TD className="text-end tabular text-ink">{w?.hearings7d ?? 0}</TD>
                        <TD className="text-end tabular text-ink">{w?.openTasks ?? 0}</TD>
                        <TD className={cn("text-end tabular", (w?.urgentTasks ?? 0) > 0 ? "font-medium text-high" : "text-ink-subtle")}>{w?.urgentTasks ?? 0}</TD>
                        <TD>
                          <div className="h-1 overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`${t("team.workload")}: ${load}`}>
                            <div className="h-full rounded-full bg-ink-subtle" style={{ width: `${(load / max) * 100}%` }} />
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {users.map((u) => {
                const w = wl.get(u.id);
                return (
                  <li key={u.id}>
                    <Link href={`/app/team/${u.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-muted">
                      <Avatar name={u.name} src={u.photoUrl} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-ink">{L(u.name, u.nameAr)}</span>
                        <span className="block truncate text-meta text-ink-subtle">{L(u.role.name, u.role.nameAr)}</span>
                      </span>
                      <span className="text-end text-meta tabular text-ink-muted">
                        {w?.activeMatters ?? 0} {t("team.activeMatters")}
                        <br />
                        {w?.openTasks ?? 0} {t("team.openTasks")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Page>
  );
}

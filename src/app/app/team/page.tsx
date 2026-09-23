import Link from "next/link";
import { notFound } from "next/navigation";
import { UsersRound, Settings } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { teamWorkload } from "@/server/services/dashboard";
import { db } from "@/server/db";
import { PageHeader, Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Team" };

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
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("team.title")} subtitle={t("team.subtitle")} actions={ctx.can("team.manage") && <Button asChild variant="secondary"><Link href="/app/settings/users"><Settings /> {t("team.manage")}</Link></Button>} />
      <p className="mt-4 rounded-md bg-surface-muted px-3 py-2 text-[12.5px] text-ink-muted">{t("team.workloadNote")}</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {users.map((u) => {
          const w = wl.get(u.id);
          const load = w ? w.activeMatters + w.openTasks : 0;
          return (
            <li key={u.id}>
              <Link href={`/app/team/${u.id}`} className="block rounded-lg border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-md">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} src={u.photoUrl} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-ink">{L(u.name, u.nameAr)}</p>
                    <p className="truncate text-[12.5px] text-ink-muted">{L(u.position ?? "", u.positionAr)}</p>
                  </div>
                  <Badge tone="neutral" className="ms-auto">{L(u.role.name, u.role.nameAr)}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[[t("team.activeMatters"), w?.activeMatters ?? 0, ""], [t("team.openTasks"), w?.openTasks ?? 0, ""], [t("team.urgent"), w?.urgentTasks ?? 0, (w?.urgentTasks ?? 0) > 0 ? "text-high" : ""], [t("team.hearings"), w?.hearings7d ?? 0, ""]].map(([k, v, c]) => (
                    <div key={k as string} className="rounded-md bg-surface-muted px-1 py-2">
                      <dd className={`text-lg font-semibold tabular ${c}`}>{v}</dd>
                      <dt className="text-[10.5px] leading-tight text-ink-subtle">{k}</dt>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-label={t("team.workload")}>
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(load / max) * 100}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {users.length === 0 && <div className="mt-6 text-center text-ink-muted"><UsersRound className="mx-auto" /></div>}
    </div>
  );
}

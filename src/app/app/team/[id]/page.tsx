import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Gavel, CheckSquare, Mail, Phone, ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { matterScopeWhere } from "@/server/services/access";
import { getAgenda } from "@/server/services/agenda";
import { listTasks } from "@/server/services/tasks";
import { Panel, Avatar, EmptyState } from "@/components/ui/layout";
import { Badge, PRIORITY_TONE, MATTER_STATUS_TONE } from "@/components/ui/badge";
import { EventRow } from "@/components/events";
import { TaskList } from "@/components/task-list";

export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("team.view")) notFound();
  const { id } = await params;
  const { t, locale } = await getT();
  const u = await db.user.findFirst({ where: { id, organizationId: ctx.org.id, kind: "STAFF", deletedAt: null }, include: { role: true } });
  if (!u) notFound();
  const now = new Date();
  // Only matters the *viewer* may see are listed — no leakage through a colleague's profile.
  const [matters, hearings, tasks] = await Promise.all([
    db.matter.findMany({ where: { AND: [matterScopeWhere(ctx), { members: { some: { userId: id } } }, { status: { in: ["ACTIVE", "PENDING", "INTAKE", "ON_HOLD"] } }] }, orderBy: { lastActivityAt: "desc" }, select: { id: true, internalNumber: true, title: true, titleAr: true, priority: true, status: true } }),
    getAgenda(ctx, { from: now, to: new Date(now.getTime() + 14 * 86400_000), kinds: ["HEARING"], mine: true, userId: id }),
    listTasks(ctx, { bucket: "all", assignee: id, mine: false }),
  ]);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const Back = locale === "ar" ? ChevronRight : ChevronLeft;
  return (
    <div className="mx-auto w-full max-w-[1300px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <Link href="/app/team" className="inline-flex items-center gap-1 text-meta text-ink-subtle hover:text-ink"><Back className="size-3.5" /> {t("team.title")}</Link>
      <header className="mt-3 flex items-center gap-4">
        <Avatar name={u.name} src={u.photoUrl} size={56} />
        <div>
          <h1 className="text-xl font-semibold text-ink">{L(u.name, u.nameAr)}</h1>
          <p className="text-body text-ink-muted">{L(u.position ?? "", u.positionAr)} · {L(u.role.name, u.role.nameAr)}</p>
          <div className="mt-1 flex gap-3 text-meta text-ink-muted">
            <a href={`mailto:${u.email}`} className="ltr-nums inline-flex items-center gap-1 hover:text-ink"><Mail className="size-3.5" /> {u.email}</a>
            {u.phone && <a href={`tel:${u.phone}`} className="ltr-nums inline-flex items-center gap-1 hover:text-ink"><Phone className="size-3.5" /> {u.phone}</a>}
          </div>
        </div>
      </header>
      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <Panel title={`${t("team.cases")} (${matters.length})`} icon={<Briefcase />}>
            {matters.length === 0 ? <EmptyState compact title="—" /> : (
              <ul className="divide-y divide-line">
                {matters.map((m) => (
                  <li key={m.id}><Link href={`/app/cases/${m.id}`} className="flex items-center gap-2 px-4 py-2.5 text-body hover:bg-surface-muted/60"><span className="ltr-nums font-mono text-meta text-ink-subtle">{m.internalNumber}</span><span className="flex-1 truncate">{L(m.title, m.titleAr)}</span><Badge tone={PRIORITY_TONE[m.priority]}>{t(`enums.priority.${m.priority}`)}</Badge><Badge tone={MATTER_STATUS_TONE[m.status]}>{t(`enums.matterStatus.${m.status}`)}</Badge></Link></li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t("team.tasks")} icon={<CheckSquare />}><TaskList rows={tasks.filter((x) => x.status !== "DONE")} /></Panel>
        </div>
        <div className="xl:col-span-5">
          <Panel title={t("team.upcomingHearings")} icon={<Gavel />}>
            {hearings.length ? <ul className="divide-y divide-line">{hearings.map((e) => <li key={e.id}><EventRow e={e} showDate /></li>)}</ul> : <EmptyState compact title={t("myWork.noHearings")} />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

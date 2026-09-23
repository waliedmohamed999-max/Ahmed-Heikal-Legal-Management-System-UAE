import Link from "next/link";
import { Gavel, CalendarClock } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { bucketCounts, listTasks, taskListQuery } from "@/server/services/tasks";
import { getAgenda } from "@/server/services/agenda";
import { PageHeader, Panel, EmptyState } from "@/components/ui/layout";
import { TaskList } from "@/components/task-list";
import { QuickButton } from "@/components/quick-button";
import { EventRow } from "@/components/events";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Work" };
const BUCKETS = ["today", "overdue", "upcoming", "waiting", "assigned", "completed"] as const;

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  const { t } = await getT();
  const sp = await searchParams;
  const q = taskListQuery.parse({ bucket: sp.bucket ?? "today", mine: true });
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400_000);
  const [rows, counts, hearings, deadlines] = await Promise.all([
    listTasks(ctx, q),
    bucketCounts(ctx, true),
    getAgenda(ctx, { from: now, to: in7, mine: true, kinds: ["HEARING"] }),
    getAgenda(ctx, { from: new Date(now.getTime() - 30 * 86400_000), to: in7, mine: true, kinds: ["DEADLINE"] }),
  ]);
  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("myWork.title")} subtitle={t("myWork.subtitle")} actions={ctx.can("tasks.manage") && <QuickButton type="task" label={t("tasks.new")} variant="primary" size="md" />} />
      <div className="mt-6 grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <nav className="mb-3 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {BUCKETS.map((b) => (
              <Link key={b} href={`/app/my-work?bucket=${b}`} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium", q.bucket === b ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-surface hover:text-ink")}>
                {t(`tasks.buckets.${b}`)}
                {b in counts && (counts as Record<string, number>)[b] > 0 && <span className={cn("rounded px-1 text-[11px] tabular", b === "overdue" ? "bg-danger text-white" : "bg-surface-sunken text-ink-muted")}>{(counts as Record<string, number>)[b]}</span>}
              </Link>
            ))}
          </nav>
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
            <TaskList rows={rows} emptyTitle={t("dashboard.tasksEmpty")} />
          </div>
        </div>
        <div className="space-y-5 xl:col-span-5">
          <Panel title={t("myWork.hearings")} icon={<Gavel />}>
            {hearings.length ? <ul className="divide-y divide-line">{hearings.map((e) => <li key={e.id}><EventRow e={e} showDate /></li>)}</ul> : <EmptyState compact title={t("myWork.noHearings")} />}
          </Panel>
          <Panel title={t("myWork.deadlines")} icon={<CalendarClock />}>
            {deadlines.length ? <ul className="divide-y divide-line">{deadlines.map((e) => <li key={e.id}><EventRow e={e} showDate /></li>)}</ul> : <EmptyState compact title={t("myWork.noDeadlines")} />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { bucketCounts, listTasks, taskListQuery } from "@/server/services/tasks";
import { getAgenda } from "@/server/services/agenda";
import { Page, Panel, EmptyState, Timeline } from "@/components/ui/layout";
import { TaskList } from "@/components/task-list";
import { QuickButton } from "@/components/quick-button";
import { EVENT_STYLE } from "@/components/event-style";
import { formatDate, formatTime } from "@/lib/time";
import { TasksHeader } from "../tasks/header";

export const metadata = { title: "My tasks" };
const BUCKETS = ["today", "overdue", "upcoming", "waiting", "assigned", "completed"] as const;

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const tz = ctx.org.timezone;
  const q = taskListQuery.parse({ bucket: sp.bucket ?? "today", mine: true });
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400_000);
  const [rows, counts, events] = await Promise.all([
    listTasks(ctx, q),
    bucketCounts(ctx, true),
    getAgenda(ctx, { from: now, to: in7, mine: true, kinds: ["HEARING", "DEADLINE"] }),
  ]);

  return (
    <Page width="full" className="max-w-[1440px]">
      <TasksHeader
        title={t("nav.tasks")}
        actions={ctx.can("tasks.manage") && <QuickButton type="task" label={t("tasks.new")} variant="primary" size="md" />}
        scope="mine"
        scopeTabs={[
          { key: "mine", href: "/app/my-work", label: t("shell.myTasks") },
          ...(ctx.can("tasks.view") ? [{ key: "all" as const, href: "/app/tasks", label: t("shell.allTasks") }] : []),
        ]}
        buckets={BUCKETS}
        current={q.bucket}
        counts={counts as Record<string, number>}
        hrefFor={(b) => `/app/my-work?bucket=${b}`}
        labelFor={(b) => t(`tasks.buckets.${b}`)}
      />

      <div className="mt-4 grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="-mx-4 min-w-0 border-y border-line sm:mx-0 sm:rounded-lg sm:border">
          <TaskList rows={rows} emptyTitle={t("dashboard.tasksEmpty")} />
        </div>
        <Panel plain title={`${t("myWork.hearings").replace(/\s*\(.*\)/, "")} · ${t("myWork.deadlines").replace(/\s*\(.*\)/, "")}`} className="hidden xl:block">
          {events.length ? (
            <Timeline
              className="pt-1"
              items={events.map((e) => ({
                key: `${e.kind}-${e.id}`,
                time: formatDate(e.startsAt, locale, tz, { day: "numeric", month: "short", year: undefined }),
                color: (EVENT_STYLE[e.eventType] ?? EVENT_STYLE.FOLLOW_UP).color,
                href: e.href,
                title: e.title,
                meta: (
                  <>
                    <span>{formatTime(e.startsAt, locale, tz)}</span>
                    {e.matter && <span className="record-id text-ink-subtle">· {e.matter.internalNumber}</span>}
                  </>
                ),
              }))}
            />
          ) : (
            <EmptyState compact title={t("myWork.noDeadlines")} />
          )}
        </Panel>
      </div>
    </Page>
  );
}

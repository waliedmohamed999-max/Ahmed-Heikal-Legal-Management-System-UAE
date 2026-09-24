import { Sun, ListTodo } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getAgenda } from "@/server/services/agenda";
import { listTasks } from "@/server/services/tasks";
import { PageHeader, Panel, EmptyState } from "@/components/ui/layout";
import { TimeGrid, Legend } from "@/components/calendar/board";
import { TaskList } from "@/components/task-list";
import { dayRange, formatHijri, formatLongDate } from "@/lib/time";

export const metadata = { title: "Today" };

export default async function AgendaPage() {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const tz = ctx.org.timezone;
  const now = new Date();
  const { start, end } = dayRange(now, tz);
  const mine = ctx.principal.scope !== "ALL";
  const [items, overdue] = await Promise.all([
    getAgenda(ctx, { from: start, to: end, mine }),
    listTasks(ctx, { bucket: "overdue", mine: true }),
  ]);
  return (
    <div className="mx-auto w-full max-w-[1300px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("agenda.title")} subtitle={`${formatLongDate(now, locale, tz)} · ${formatHijri(now, locale, tz)}`} />
      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Panel title={t("agenda.subtitle")} icon={<Sun />}>
            {items.length === 0 ? <EmptyState icon={<Sun />} title={t("agenda.empty")} body={t("agenda.emptyBody")} /> : <TimeGrid days={[start.toISOString()]} items={items} startHour={7} endHour={21} />}
          </Panel>
          <div className="mt-3"><Legend /></div>
        </div>
        <div className="xl:col-span-4">
          <Panel title={t("tasks.buckets.overdue")} icon={<ListTodo />}>
            <TaskList rows={overdue} emptyTitle={t("dashboard.tasksEmpty")} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { bucketCounts, listTasks, taskListQuery } from "@/server/services/tasks";
import { getReference } from "@/server/services/reference";
import { Page } from "@/components/ui/layout";
import { TasksHeader } from "./header";
import { TaskList } from "@/components/task-list";
import { QuickButton } from "@/components/quick-button";
import { ListSearch } from "@/components/list-search";

export const metadata = { title: "Tasks" };
const BUCKETS = ["all", "today", "overdue", "upcoming", "waiting", "assigned", "completed"] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("tasks.view")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const q = taskListQuery.parse(sp);
  const [rows, counts, ref] = await Promise.all([listTasks(ctx, q), bucketCounts(ctx, q.mine), getReference(ctx.org.id)]);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const href = (b: string) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("bucket", b);
    u.delete("task");
    return `/app/tasks?${u}`;
  };
  return (
    <Page width="full" className="max-w-[1440px]">
      <TasksHeader
        title={t("nav.tasks")}
        actions={ctx.can("tasks.manage") && <QuickButton type="task" label={t("tasks.new")} variant="primary" size="md" />}
        scope="all"
        scopeTabs={[
          { key: "mine", href: "/app/my-work", label: t("shell.myTasks") },
          { key: "all", href: "/app/tasks", label: t("shell.allTasks") },
        ]}
        buckets={BUCKETS}
        current={q.bucket}
        counts={counts as Record<string, number>}
        hrefFor={href}
        labelFor={(b) => t(`tasks.buckets.${b}`)}
      />
      <ListSearch className="mt-3" placeholder={t("common.search")} filters={[
        { key: "assignee", label: t("tasks.fields.assignee"), options: ref.staff.map((s) => ({ value: s.id, label: L(s.name, s.nameAr) })) },
        { key: "priority", label: t("common.priority"), options: ["CRITICAL", "HIGH", "NORMAL", "LOW"].map((p) => ({ value: p, label: t(`enums.priority.${p}`) })) },
        { key: "mine", label: t("tasks.mine"), options: [{ value: "1", label: t("common.yes") }] },
      ]} />
      <div className="-mx-4 mt-3 border-y border-line sm:mx-0 sm:rounded-lg sm:border">
        <TaskList rows={rows} emptyTitle={t("tasks.empty")} />
      </div>
    </Page>
  );
}

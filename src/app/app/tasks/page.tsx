import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { bucketCounts, listTasks, taskListQuery } from "@/server/services/tasks";
import { getReference } from "@/server/services/reference";
import { PageHeader } from "@/components/ui/layout";
import { TaskList } from "@/components/task-list";
import { QuickButton } from "@/components/quick-button";
import { ListSearch } from "@/components/list-search";
import { cn } from "@/lib/utils";

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
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitle")} actions={ctx.can("tasks.manage") && <QuickButton type="task" label={t("tasks.new")} variant="primary" size="md" />} />
      <nav className="mt-6 flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {BUCKETS.map((b) => (
          <Link key={b} href={href(b)} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium", q.bucket === b ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-surface hover:text-ink")}>
            {t(`tasks.buckets.${b}`)}
            {b in counts && (counts as Record<string, number>)[b] > 0 && <span className={cn("rounded px-1 text-[11px] tabular", b === "overdue" ? "bg-danger text-white" : "bg-surface-sunken text-ink-muted")}>{(counts as Record<string, number>)[b]}</span>}
          </Link>
        ))}
      </nav>
      <ListSearch className="mt-3" placeholder={t("common.search")} filters={[
        { key: "assignee", label: t("tasks.fields.assignee"), options: ref.staff.map((s) => ({ value: s.id, label: L(s.name, s.nameAr) })) },
        { key: "priority", label: t("common.priority"), options: ["CRITICAL", "HIGH", "NORMAL", "LOW"].map((p) => ({ value: p, label: t(`enums.priority.${p}`) })) },
        { key: "mine", label: t("tasks.mine"), options: [{ value: "1", label: t("common.yes") }] },
      ]} />
      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        <TaskList rows={rows} emptyTitle={t("tasks.empty")} />
      </div>
    </div>
  );
}

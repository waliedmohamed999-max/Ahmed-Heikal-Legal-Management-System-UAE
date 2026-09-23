import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { listTasks } from "@/server/services/tasks";
import { Panel } from "@/components/ui/layout";
import { TaskList } from "@/components/task-list";
import { QuickButton } from "@/components/quick-button";

export default async function CaseTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { t } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  const [open, done] = await Promise.all([
    listTasks(ctx, { bucket: "all", matter: id, mine: false }),
    listTasks(ctx, { bucket: "completed", matter: id, mine: false }),
  ]);
  const canManage = ws.caps.includes("tasks.manage");
  return (
    <div className="space-y-5">
      <Panel title={t("tasks.title")} actions={canManage && <QuickButton type="task" matterId={id} label={t("tasks.new")} />}>
        <TaskList rows={open.filter((r) => r.status !== "DONE")} showMatter={false} emptyAction={canManage && <QuickButton type="task" matterId={id} label={t("tasks.new")} variant="primary" />} />
      </Panel>
      {done.length > 0 && (
        <Panel title={t("tasks.buckets.completed")}>
          <TaskList rows={done} showMatter={false} />
        </Panel>
      )}
    </div>
  );
}

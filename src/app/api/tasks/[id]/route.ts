import { staffRoute } from "@/server/api";
import { getTaskDetail } from "@/server/services/tasks";

export const GET = staffRoute(async (_req, ctx, params) => {
  const t = await getTaskDetail(ctx, params.id);
  return {
    id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, dueAt: t.dueAt, startAt: t.startAt, estimateMinutes: t.estimateMinutes,
    completedAt: t.completedAt, createdAt: t.createdAt, sourceType: t.sourceType, matter: t.matter, assignee: t.assignee, createdBy: t.createdBy,
    checklist: t.checklist.map((c) => ({ id: c.id, title: c.title, done: !!c.doneAt })),
    dependsOn: t.dependsOn.map((d) => d.dependsOn),
    comments: t.comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: c.author })),
  };
});

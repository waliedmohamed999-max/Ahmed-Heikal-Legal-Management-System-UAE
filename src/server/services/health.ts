import "server-only";
import { db } from "../db";

/**
 * Case Health: measurable operational indicators only. Deliberately no
 * "probability of winning" and no AI prediction of legal outcomes.
 */
export async function matterHealth(matterId: string) {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400_000);
  const [missingRequired, openTasks, overdueTasks, overdueDeadlines, upcomingDeadlines, unverified, unreviewedDocs, waitingClient, matter] = await Promise.all([
    db.matterChecklistItem.count({ where: { matterId, required: true, doneAt: null } }),
    db.task.count({ where: { matterId, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } } }),
    db.task.count({ where: { matterId, deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, dueAt: { lt: now } } }),
    db.deadline.count({ where: { matterId, deletedAt: null, status: "OPEN", dueAt: { lt: now } } }),
    db.deadline.count({ where: { matterId, deletedAt: null, status: "OPEN", dueAt: { gte: now, lt: in7d } } }),
    db.deadline.count({ where: { matterId, deletedAt: null, status: "OPEN", verification: "NEEDS_VERIFICATION" } }),
    db.document.count({ where: { matterId, deletedAt: null, status: { in: ["UNDER_REVIEW", "CHANGES_REQUESTED"] } } }),
    db.task.count({ where: { matterId, deletedAt: null, status: "WAITING" } }),
    db.matter.findUnique({ where: { id: matterId }, select: { lastActivityAt: true } }),
  ]);
  const daysSinceActivity = matter ? Math.floor((now.getTime() - matter.lastActivityAt.getTime()) / 86400_000) : 0;
  const indicators = [
    { key: "missingDocuments", value: missingRequired, tone: missingRequired ? "warning" : "ok" },
    { key: "openTasks", value: openTasks, tone: "neutral" },
    { key: "overdueItems", value: overdueTasks + overdueDeadlines, tone: overdueTasks + overdueDeadlines ? "danger" : "ok" },
    { key: "upcomingDeadlines", value: upcomingDeadlines, tone: upcomingDeadlines ? "warning" : "ok" },
    { key: "unverifiedDeadlines", value: unverified, tone: unverified ? "warning" : "ok" },
    { key: "unreviewedDocuments", value: unreviewedDocs, tone: unreviewedDocs ? "warning" : "ok" },
    { key: "clientResponsePending", value: waitingClient, tone: waitingClient ? "warning" : "ok" },
    { key: "daysSinceActivity", value: daysSinceActivity, tone: daysSinceActivity > 30 ? "danger" : daysSinceActivity > 14 ? "warning" : "ok" },
  ] as const;
  return indicators;
}

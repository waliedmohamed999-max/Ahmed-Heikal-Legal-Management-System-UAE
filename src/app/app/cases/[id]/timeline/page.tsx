import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { db } from "@/server/db";
import { TimelineView } from "./view";

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { locale } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  const [events, docs] = await Promise.all([
    db.timelineEvent.findMany({ where: { matterId: id, status: { not: "REJECTED" } }, orderBy: { occurredAt: "asc" } }),
    ws.caps.includes("documents.view") ? db.document.findMany({ where: { matterId: id, deletedAt: null }, select: { id: true, title: true } }) : [],
  ]);
  const userIds = [...new Set(events.map((e) => e.userId).filter(Boolean))] as string[];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, nameAr: true } });
  const uname = new Map(users.map((u) => [u.id, locale === "ar" ? u.nameAr || u.name : u.name]));
  const docMap = new Map(docs.map((d) => [d.id, d.title]));
  return (
    <TimelineView
      matterId={id}
      canEdit={ws.caps.includes("matters.edit")}
      documents={docs}
      events={events.map((e) => ({
        id: e.id, eventType: e.eventType, title: e.title, description: e.description, notes: e.notes, occurredAt: e.occurredAt.toISOString(),
        source: e.source, status: e.status, user: e.userId ? uname.get(e.userId) ?? null : null,
        documents: e.documentIds.filter((d) => docMap.has(d)).map((d) => ({ id: d, title: docMap.get(d)! })),
        citations: (e.citations as { document: string; page?: number }[] | null) ?? null,
      }))}
    />
  );
}

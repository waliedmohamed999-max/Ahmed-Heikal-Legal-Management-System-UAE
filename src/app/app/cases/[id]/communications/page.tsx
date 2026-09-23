import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { db } from "@/server/db";
import { CommunicationsView } from "@/components/communications";

export default async function CommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { locale } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  const rows = await db.communication.findMany({ where: { matterId: id }, orderBy: { occurredAt: "desc" }, take: 200 });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[] } }, select: { id: true, name: true, nameAr: true } });
  const un = new Map(users.map((u) => [u.id, locale === "ar" ? u.nameAr || u.name : u.name]));
  return (
    <CommunicationsView
      matterId={id}
      canLog={ws.caps.includes("communications.manage")}
      items={rows.map((r) => ({ id: r.id, channel: r.channel, direction: r.direction, subject: r.subject, body: r.body, occurredAt: r.occurredAt.toISOString(), user: r.userId ? un.get(r.userId) ?? null : null }))}
    />
  );
}

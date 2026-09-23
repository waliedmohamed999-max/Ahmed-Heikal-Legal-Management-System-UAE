import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { getReference } from "@/server/services/reference";
import { db } from "@/server/db";
import { TeamView } from "./view";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { locale } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  const canManage = ws.caps.includes("matters.manageMembers");
  const [ref, requests] = await Promise.all([
    getReference(ctx.org.id),
    canManage ? db.accessRequest.findMany({ where: { matterId: id, status: "PENDING" }, include: { requester: { select: { name: true, nameAr: true } } }, orderBy: { createdAt: "desc" } }) : [],
  ]);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <TeamView
      matterId={id}
      canManage={canManage}
      members={ws.matter.members.map((m) => ({
        userId: m.userId, name: L(m.user.name, m.user.nameAr), photoUrl: m.user.photoUrl, position: L(m.user.position ?? "", m.user.positionAr),
        role: m.role, overrides: m.overrides, expiresAt: m.expiresAt?.toISOString() ?? null,
      }))}
      staff={ref.staff.filter((s) => !ws.matter.members.some((m) => m.userId === s.id)).map((s) => ({ id: s.id, name: L(s.name, s.nameAr), role: L(s.role.name, s.role.nameAr) }))}
      requests={requests.map((r) => ({ id: r.id, name: L(r.requester.name, r.requester.nameAr), reason: r.reason, createdAt: r.createdAt.toISOString() }))}
    />
  );
}

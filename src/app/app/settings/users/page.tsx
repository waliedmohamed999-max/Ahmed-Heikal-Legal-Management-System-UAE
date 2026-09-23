import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { UsersView } from "./view";

export default async function UsersPage() {
  const ctx = await requireStaff();
  if (!ctx.can("team.manage")) notFound();
  const { locale } = await getT();
  const [users, roles] = await Promise.all([
    db.user.findMany({ where: { organizationId: ctx.org.id, kind: "STAFF", deletedAt: null }, orderBy: { name: "asc" }, include: { role: { select: { id: true, name: true, nameAr: true } } } }),
    db.role.findMany({ where: { organizationId: ctx.org.id, key: { not: "client" } }, orderBy: { rank: "asc" }, select: { id: true, name: true, nameAr: true, key: true } }),
  ]);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  return (
    <UsersView
      meId={ctx.user.id}
      roles={roles.filter((r) => r.key !== "owner" || ctx.can("roles.manage")).map((r) => ({ id: r.id, name: L(r.name, r.nameAr) }))}
      users={users.map((u) => ({
        id: u.id, email: u.email, name: u.name, nameAr: u.nameAr ?? "", position: u.position ?? "", positionAr: u.positionAr ?? "", phone: u.phone ?? "",
        roleId: u.roleId, roleName: L(u.role.name, u.role.nameAr), status: u.status, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, mfaEnabled: u.mfaEnabled, photoUrl: u.photoUrl,
      }))}
    />
  );
}

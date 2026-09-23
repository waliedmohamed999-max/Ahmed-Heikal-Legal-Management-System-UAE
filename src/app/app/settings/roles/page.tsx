import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { PERMISSIONS } from "@/lib/permissions";
import { RolesView } from "./view";

export default async function RolesPage() {
  const ctx = await requireStaff();
  if (!ctx.can("roles.manage")) notFound();
  const { locale } = await getT();
  const roles = await db.role.findMany({ where: { organizationId: ctx.org.id, key: { not: "client" } }, orderBy: { rank: "asc" }, include: { permissions: true, _count: { select: { users: true } } } });
  return (
    <RolesView
      catalog={Object.entries(PERMISSIONS).filter(([k]) => k !== "portal.access").map(([key, description]) => ({ key, description }))}
      roles={roles.map((r) => ({
        id: r.id, key: r.key, name: r.name, nameAr: r.nameAr ?? "", label: locale === "ar" ? r.nameAr || r.name : r.name, description: r.description ?? "", isSystem: r.isSystem,
        matterScope: r.matterScope, permissions: r.permissions.map((p) => p.permissionKey), users: r._count.users,
      }))}
    />
  );
}

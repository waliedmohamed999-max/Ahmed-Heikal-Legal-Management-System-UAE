import { staffRoute } from "@/server/api";
import { db } from "@/server/db";
import { matterScopeWhere } from "@/server/services/access";
import { AppError } from "@/server/errors";

/** Typeahead for pickers. Same access rules as the modules themselves. */
export const GET = staffRoute(async (req, ctx) => {
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const ci = { contains: q, mode: "insensitive" as const };
  const take = 15;
  switch (type) {
    case "clients": {
      if (!ctx.can("clients.view")) throw new AppError("forbidden", 403);
      const rows = await db.client.findMany({
        where: { organizationId: ctx.org.id, deletedAt: null, ...(q ? { OR: [{ nameEn: ci }, { nameAr: ci }, { clientNumber: ci }, { email: ci }] } : {}) },
        orderBy: { updatedAt: "desc" }, take, select: { id: true, nameEn: true, nameAr: true, clientNumber: true, type: true },
      });
      return { items: rows.map((r) => ({ id: r.id, label: r.nameEn, labelAr: r.nameAr, sub: r.clientNumber, kind: r.type })) };
    }
    case "contacts": {
      if (!ctx.can("contacts.view")) throw new AppError("forbidden", 403);
      const rows = await db.contact.findMany({
        where: { organizationId: ctx.org.id, deletedAt: null, ...(q ? { OR: [{ nameEn: ci }, { nameAr: ci }, { companyName: ci }] } : {}) },
        orderBy: { nameEn: "asc" }, take, select: { id: true, nameEn: true, nameAr: true, category: true, type: true },
      });
      return { items: rows.map((r) => ({ id: r.id, label: r.nameEn, labelAr: r.nameAr, sub: r.category, kind: r.type })) };
    }
    case "matters": {
      const rows = await db.matter.findMany({
        where: { AND: [matterScopeWhere(ctx), { status: { notIn: ["ARCHIVED"] } }, q ? { OR: [{ title: ci }, { titleAr: ci }, { internalNumber: ci }, { officialCaseNumber: ci }] } : {}] },
        orderBy: { lastActivityAt: "desc" }, take, select: { id: true, title: true, titleAr: true, internalNumber: true, clientId: true },
      });
      return { items: rows.map((r) => ({ id: r.id, label: r.title, labelAr: r.titleAr, sub: r.internalNumber, clientId: r.clientId })) };
    }
    case "users": {
      const rows = await db.user.findMany({
        where: { organizationId: ctx.org.id, kind: "STAFF", status: "ACTIVE", deletedAt: null, ...(q ? { OR: [{ name: ci }, { nameAr: ci }] } : {}) },
        orderBy: { name: "asc" }, take: 50, select: { id: true, name: true, nameAr: true, position: true },
      });
      return { items: rows.map((r) => ({ id: r.id, label: r.name, labelAr: r.nameAr, sub: r.position })) };
    }
    default:
      throw new AppError("validation", 400);
  }
});

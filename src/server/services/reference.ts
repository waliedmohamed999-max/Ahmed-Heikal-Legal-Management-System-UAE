import "server-only";
import { cache } from "react";
import { db } from "../db";

/** Admin-managed reference data (per request cache). */
export const getReference = cache(async (orgId: string) => {
  const [jurisdictions, courts, caseTypes, staff, stages] = await Promise.all([
    db.jurisdiction.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, nameAr: true, kind: true, emirate: true } }),
    db.court.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, jurisdictionId: true, level: true } }),
    db.caseType.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, nameAr: true, category: { select: { name: true, nameAr: true } } } }),
    db.user.findMany({ where: { organizationId: orgId, kind: "STAFF", status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, photoUrl: true, position: true, positionAr: true, role: { select: { key: true, name: true, nameAr: true } } } }),
    db.workflowStage.findMany({ where: { workflow: { organizationId: orgId } }, orderBy: [{ workflowId: "asc" }, { order: "asc" }], select: { id: true, name: true, nameAr: true, workflowId: true, workflow: { select: { name: true, nameAr: true } } } }),
  ]);
  return { jurisdictions, courts, caseTypes, staff, stages };
});
export type Reference = Awaited<ReturnType<typeof getReference>>;

import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/layout";
import { ImportView } from "./view";

export const metadata = { title: "Court data import" };

export default async function CourtImportPage() {
  const ctx = await requireStaff();
  if (!ctx.can("deadlines.manage")) notFound();
  const { t } = await getT();
  const history = await db.courtImport.findMany({
    where: { organizationId: ctx.org.id, createdById: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, sourceType: true, status: true, createdAt: true, suggestions: true },
  });
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("courtImport.title")} subtitle={t("courtImport.subtitle")} />
      <ImportView history={history.map((h) => ({ id: h.id, sourceType: h.sourceType, status: h.status, createdAt: h.createdAt.toISOString(), count: Array.isArray(h.suggestions) ? h.suggestions.length : 0 }))} />
    </div>
  );
}

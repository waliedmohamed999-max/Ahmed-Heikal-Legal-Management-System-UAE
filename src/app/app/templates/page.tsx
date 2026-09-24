import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { TEMPLATE_KINDS } from "@/lib/templates";
import { PageHeader } from "@/components/ui/layout";
import { TemplatesView } from "./view";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const ctx = await requireStaff();
  if (!ctx.can("knowledge.view")) notFound();
  const { t } = await getT();
  const manage = ctx.can("knowledge.manage");
  const rows = await db.template.findMany({ where: { organizationId: ctx.org.id, ...(manage ? {} : { active: true }) }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("templatesPage.title")} subtitle={t("templatesPage.subtitle")} />
      <TemplatesView
        canManage={manage}
        canNote={ctx.can("notes.create")}
        rows={rows.map((r) => ({ id: r.id, kind: r.kind as (typeof TEMPLATE_KINDS)[number], name: r.name, locale: r.locale as "ar" | "en", body: r.body, active: r.active }))}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { NestedEditor } from "../reference-editor";

export default async function ChecklistsPage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const { t, locale } = await getT();
  const [tpls, types] = await Promise.all([
    db.checklistTemplate.findMany({ where: { organizationId: ctx.org.id }, include: { items: { orderBy: { order: "asc" } }, caseType: true }, orderBy: { name: "asc" } }),
    db.caseType.findMany({ where: { organizationId: ctx.org.id }, orderBy: { name: "asc" } }),
  ]);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <div className="space-y-5">
      <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">{t("settings.reference.note")}</p>
      <NestedEditor
        kind="checklist"
        title={t("settings.reference.checklists")}
        rows={tpls.map((c) => ({
          id: c.id, name: c.name, nameAr: c.nameAr ?? "", caseTypeId: c.caseTypeId ?? "", active: c.active,
          items: c.items.map((i) => ({ title: i.title, titleAr: i.titleAr ?? "", required: i.required })),
          display: L(c.name, c.nameAr), sub: c.caseType ? L(c.caseType.name, c.caseType.nameAr) : undefined,
        }))}
        header={[
          { name: "name", label: t("clients.fields.nameEn"), type: "text", dir: "ltr", required: true },
          { name: "nameAr", label: t("clients.fields.nameAr"), type: "text", dir: "rtl" },
          { name: "caseTypeId", label: t("intake.caseType"), type: "select", options: types.map((c) => ({ value: c.id, label: L(c.name, c.nameAr) })), empty: true },
          { name: "active", label: t("settings.reference.active"), type: "checkbox" },
        ]}
        childKey="items"
        childFields={[
          { name: "title", label: t("clients.fields.nameEn"), type: "text", dir: "ltr" },
          { name: "titleAr", label: t("clients.fields.nameAr"), type: "text", dir: "rtl" },
          { name: "required", label: t("common.required"), type: "checkbox" },
        ]}
        blank={{ name: "", nameAr: "", caseTypeId: "", active: true }}
        blankChild={{ title: "", titleAr: "", required: false }}
      />
    </div>
  );
}

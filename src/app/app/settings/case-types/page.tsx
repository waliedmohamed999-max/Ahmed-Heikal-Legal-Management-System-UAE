import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { ReferenceTable, NestedEditor } from "../reference-editor";

export default async function CaseTypesPage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const { t, locale } = await getT();
  const [types, cats, workflows, jurs] = await Promise.all([
    db.caseType.findMany({ where: { organizationId: ctx.org.id }, orderBy: { name: "asc" } }),
    db.caseCategory.findMany({ where: { organizationId: ctx.org.id }, orderBy: { order: "asc" } }),
    db.workflow.findMany({ where: { organizationId: ctx.org.id }, include: { stages: { orderBy: { order: "asc" } } }, orderBy: { name: "asc" } }),
    db.jurisdiction.findMany({ where: { organizationId: ctx.org.id }, orderBy: { name: "asc" } }),
  ]);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const catOpts = cats.map((c) => ({ value: c.id, label: L(c.name, c.nameAr) }));
  const typeOpts = types.map((c) => ({ value: c.id, label: L(c.name, c.nameAr) }));
  return (
    <div className="space-y-5">
      <ReferenceTable
        kind="caseType"
        title={t("settings.reference.caseTypes")}
        rows={types.map((c) => ({ id: c.id, code: c.code, name: c.name, nameAr: c.nameAr ?? "", categoryId: c.categoryId ?? "", active: c.active, label: L(c.name, c.nameAr), cat: catOpts.find((x) => x.value === c.categoryId)?.label ?? "—" }))}
        columns={[{ key: "code", label: t("settings.reference.code") }, { key: "label", label: t("common.name") }, { key: "cat", label: t("settings.reference.category") }]}
        fields={[
          { name: "code", label: t("settings.reference.code"), type: "text", dir: "ltr", mono: true, required: true },
          { name: "categoryId", label: t("settings.reference.category"), type: "select", options: catOpts, empty: true },
          { name: "name", label: t("clients.fields.nameEn"), type: "text", dir: "ltr", required: true },
          { name: "nameAr", label: t("clients.fields.nameAr"), type: "text", dir: "rtl" },
          { name: "active", label: t("settings.reference.active"), type: "checkbox" },
        ]}
        blank={{ code: "", categoryId: "", name: "", nameAr: "", active: true }}
      />
      <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">{t("settings.reference.note")}</p>
      <NestedEditor
        kind="workflow"
        title={t("settings.reference.workflows")}
        rows={workflows.map((w) => ({
          id: w.id, name: w.name, nameAr: w.nameAr ?? "", jurisdictionId: w.jurisdictionId ?? "", caseTypeId: w.caseTypeId ?? "", isDefault: w.isDefault,
          stages: w.stages.map((s) => ({ key: s.key, name: s.name, nameAr: s.nameAr ?? "", isTerminal: s.isTerminal })),
          display: L(w.name, w.nameAr), sub: w.isDefault ? t("settings.reference.isDefault") : undefined,
        }))}
        header={[
          { name: "name", label: t("clients.fields.nameEn"), type: "text", dir: "ltr", required: true },
          { name: "nameAr", label: t("clients.fields.nameAr"), type: "text", dir: "rtl" },
          { name: "jurisdictionId", label: t("settings.reference.jurisdiction"), type: "select", options: jurs.map((j) => ({ value: j.id, label: L(j.name, j.nameAr) })), empty: true },
          { name: "caseTypeId", label: t("intake.caseType"), type: "select", options: typeOpts, empty: true },
          { name: "isDefault", label: t("settings.reference.isDefault"), type: "checkbox" },
        ]}
        childKey="stages"
        childFields={[
          { name: "key", label: t("settings.reference.stageKey"), type: "text", dir: "ltr", mono: true },
          { name: "name", label: t("clients.fields.nameEn"), type: "text", dir: "ltr" },
          { name: "nameAr", label: t("clients.fields.nameAr"), type: "text", dir: "rtl" },
          { name: "isTerminal", label: t("settings.reference.terminal"), type: "checkbox" },
        ]}
        blank={{ name: "", nameAr: "", jurisdictionId: "", caseTypeId: "", isDefault: false }}
        blankChild={{ key: "", name: "", nameAr: "", isTerminal: false }}
      />
    </div>
  );
}

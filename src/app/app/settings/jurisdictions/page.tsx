import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { ReferenceTable } from "../reference-editor";

export default async function JurisdictionsPage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const { t, locale } = await getT();
  const [jurs, courts] = await Promise.all([
    db.jurisdiction.findMany({ where: { organizationId: ctx.org.id }, orderBy: { name: "asc" } }),
    db.court.findMany({ where: { organizationId: ctx.org.id }, orderBy: { name: "asc" } }),
  ]);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const kinds = ["FEDERAL", "LOCAL", "FREE_ZONE", "ARBITRATION", "OTHER"].map((k) => ({ value: k, label: t(`enums.jurisdictionKind.${k}`) }));
  const jurOpts = jurs.map((j) => ({ value: j.id, label: L(j.name, j.nameAr) }));
  return (
    <div className="space-y-5">
      <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">{t("settings.reference.note")}</p>
      <ReferenceTable
        kind="jurisdiction"
        title={t("settings.reference.jurisdictions")}
        rows={jurs.map((j) => ({ id: j.id, code: j.code, name: j.name, nameAr: j.nameAr ?? "", kind: j.kind, emirate: j.emirate ?? "", active: j.active, label: L(j.name, j.nameAr), kindLabel: t(`enums.jurisdictionKind.${j.kind}`) }))}
        columns={[{ key: "code", label: t("settings.reference.code") }, { key: "label", label: t("common.name") }, { key: "kindLabel", label: t("settings.reference.kind") }, { key: "emirate", label: t("settings.reference.emirate") }]}
        fields={[
          { name: "code", label: t("settings.reference.code"), type: "text", dir: "ltr", mono: true, required: true },
          { name: "kind", label: t("settings.reference.kind"), type: "select", options: kinds },
          { name: "name", label: t("clients.fields.nameEn"), type: "text", dir: "ltr", required: true },
          { name: "nameAr", label: t("clients.fields.nameAr"), type: "text", dir: "rtl" },
          { name: "emirate", label: t("settings.reference.emirate"), type: "text" },
          { name: "active", label: t("settings.reference.active"), type: "checkbox" },
        ]}
        blank={{ code: "", kind: "LOCAL", name: "", nameAr: "", emirate: "", active: true }}
      />
      <ReferenceTable
        kind="court"
        title={t("settings.reference.courts")}
        rows={courts.map((c) => ({ id: c.id, jurisdictionId: c.jurisdictionId, name: c.name, nameAr: c.nameAr ?? "", level: c.level ?? "", emirate: c.emirate ?? "", active: c.active, label: L(c.name, c.nameAr), jur: jurOpts.find((j) => j.value === c.jurisdictionId)?.label ?? "" }))}
        columns={[{ key: "label", label: t("common.name") }, { key: "jur", label: t("settings.reference.jurisdiction") }, { key: "level", label: t("settings.reference.level") }]}
        fields={[
          { name: "jurisdictionId", label: t("settings.reference.jurisdiction"), type: "select", options: jurOpts },
          { name: "level", label: t("settings.reference.level"), type: "text" },
          { name: "name", label: t("clients.fields.nameEn"), type: "text", dir: "ltr", required: true },
          { name: "nameAr", label: t("clients.fields.nameAr"), type: "text", dir: "rtl" },
          { name: "emirate", label: t("settings.reference.emirate"), type: "text" },
          { name: "active", label: t("settings.reference.active"), type: "checkbox" },
        ]}
        blank={{ jurisdictionId: jurOpts[0]?.value ?? "", name: "", nameAr: "", level: "", emirate: "", active: true }}
      />
    </div>
  );
}

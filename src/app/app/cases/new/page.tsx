import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getReference } from "@/server/services/reference";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/layout";
import { IntakeWizard } from "./wizard";

export const metadata = { title: "New case" };

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("matters.create")) notFound();
  const { t, locale } = await getT();
  const ref = await getReference(ctx.org.id);
  const { client } = await searchParams;
  const pre = client ? await db.client.findFirst({ where: { id: client, organizationId: ctx.org.id, deletedAt: null }, select: { id: true, nameEn: true, nameAr: true } }) : null;
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("intake.title")} subtitle={t("intake.subtitle")} />
      <IntakeWizard
        me={ctx.user.id}
        canCreateClient={ctx.can("clients.create")}
        preClient={pre ? { id: pre.id, label: L(pre.nameEn, pre.nameAr) } : null}
        options={{
          caseTypes: ref.caseTypes.map((c) => ({ value: c.id, label: L(c.name, c.nameAr), group: c.category ? L(c.category.name, c.category.nameAr) : "" })),
          jurisdictions: ref.jurisdictions.map((j) => ({ value: j.id, label: L(j.name, j.nameAr), group: j.kind })),
          courts: ref.courts.map((c) => ({ value: c.id, label: L(c.name, c.nameAr), group: c.jurisdictionId })),
          staff: ref.staff.map((s) => ({ value: s.id, label: L(s.name, s.nameAr), group: L(s.role.name, s.role.nameAr) })),
        }}
      />
    </div>
  );
}

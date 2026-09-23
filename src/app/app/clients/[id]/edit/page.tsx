import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ClientForm } from "../../client-form";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("clients.edit")) notFound();
  const { id } = await params;
  const { t } = await getT();
  const c = await db.client.findFirst({ where: { id, organizationId: ctx.org.id, deletedAt: null } });
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t("clients.edit")} subtitle={c.nameEn} />
      <Panel className="mt-6">
        <ClientForm
          id={c.id}
          canSensitive={ctx.can("clients.viewSensitive")}
          hasSensitive={!!(c.emiratesIdEnc || c.passportEnc)}
          initial={{
            type: c.type, nameEn: c.nameEn, nameAr: c.nameAr ?? "", email: c.email ?? "", phone: c.phone ?? "", whatsapp: c.whatsapp ?? "", address: c.address ?? "",
            nationality: c.nationality ?? "", preferredLanguage: c.preferredLanguage as "ar" | "en", tradeLicenseNo: c.tradeLicenseNo ?? "", companyName: c.companyName ?? "",
            source: c.source ?? "", notes: c.notes ?? "", status: c.status,
          }}
        />
      </Panel>
    </div>
  );
}

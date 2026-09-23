import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ClientForm } from "../client-form";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  const ctx = await requireStaff();
  if (!ctx.can("clients.create")) notFound();
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title={t("clients.new")} />
      <Panel className="mt-6">
        <ClientForm canSensitive={ctx.can("clients.viewSensitive")} />
      </Panel>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { matterAccess } from "@/server/services/access";
import { PageHeader } from "@/components/ui/layout";
import { InvoiceEditor } from "../../forms";
import { isoDateInDays } from "@/lib/time";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ matter?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("finance.manage")) notFound();
  const { t, locale } = await getT();
  const { matter } = await searchParams;
  let init: { clientId: string; matterId: string; labels: { client: string; matter: string } } | null = null;
  if (matter && /^[0-9a-f-]{36}$/i.test(matter)) {
    const m = await db.matter.findFirst({ where: { id: matter, organizationId: ctx.org.id }, include: { client: true } });
    if (m && (ctx.principal.scope !== "ASSIGNED" || (await matterAccess(ctx, m.id)).has("finance.manage"))) {
      init = { clientId: m.clientId, matterId: m.id, labels: { client: locale === "ar" ? m.client.nameAr || m.client.nameEn : m.client.nameEn, matter: `${m.internalNumber} · ${m.title}` } };
    }
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("finance.newInvoice")} />
      <div className="mt-6">
        <InvoiceEditor
          vatRate={ctx.org.vatRate}
          labels={init?.labels}
          initial={init ? {
            id: "", clientId: init.clientId, matterId: init.matterId, issueDate: isoDateInDays(0, ctx.org.timezone), dueDate: isoDateInDays(30, ctx.org.timezone),
            discount: 0, vatRate: ctx.org.vatRate, notes: "", portalVisible: true, items: [{ description: "", kind: "FEE", quantity: 1, unitPrice: 0, timeEntryId: null, expenseId: null }],
          } : undefined}
        />
      </div>
    </div>
  );
}

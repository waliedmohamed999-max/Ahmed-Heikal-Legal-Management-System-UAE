import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getInvoice } from "@/server/services/finance-queries";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/ui/layout";
import { InvoiceEditor } from "../../../forms";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("finance.manage")) notFound();
  const { id } = await params;
  const { t, locale } = await getT();
  const inv = await getInvoice(ctx, id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  if (inv.status !== "DRAFT") redirect(`/app/finance/invoices/${id}`);
  const tz = ctx.org.timezone;
  const d = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={`${t("common.edit")} · ${inv.number}`} />
      <div className="mt-6">
        <InvoiceEditor
          vatRate={Number(inv.vatRate)}
          labels={{ client: locale === "ar" ? inv.client.nameAr || inv.client.nameEn : inv.client.nameEn, matter: inv.matter ? `${inv.matter.internalNumber} · ${inv.matter.title}` : undefined }}
          initial={{
            id: inv.id, clientId: inv.clientId, matterId: inv.matterId ?? "", issueDate: d(inv.issueDate), dueDate: d(inv.dueDate), discount: Number(inv.discount), vatRate: Number(inv.vatRate),
            notes: inv.notes ?? "", portalVisible: inv.portalVisible,
            items: inv.items.map((i) => ({ description: i.description, kind: i.kind as never, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), timeEntryId: i.timeEntryId, expenseId: i.expenseId })),
          }}
        />
      </div>
    </div>
  );
}

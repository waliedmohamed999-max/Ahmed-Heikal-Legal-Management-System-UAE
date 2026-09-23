import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { OfficeForm } from "./form";

export default async function OfficePage() {
  const ctx = await requireStaff();
  if (!ctx.can("settings.manage")) notFound();
  const o = await db.organization.findUniqueOrThrow({ where: { id: ctx.org.id } });
  return (
    <OfficeForm
      tz={o.timezone}
      currency={o.currency}
      initial={{
        name: o.name, nameAr: o.nameAr ?? "", trn: o.trn ?? "", address: o.address ?? "", phone: o.phone ?? "", email: o.email ?? "", vatRate: Number(o.vatRate),
        matterPrefix: o.matterPrefix, invoicePrefix: o.invoicePrefix, hijri: (o.settings as { hijri?: boolean }).hijri !== false,
      }}
    />
  );
}

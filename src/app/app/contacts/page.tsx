import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { listContacts } from "@/server/services/clients";
import { PageHeader } from "@/components/ui/layout";
import { ListSearch } from "@/components/list-search";
import { CONTACT_CATEGORIES } from "@/lib/schemas";
import { ContactsView } from "./view";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("contacts.view")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listContacts(ctx, { q: sp.q, category: CONTACT_CATEGORIES.includes(sp.category as never) ? sp.category : undefined, page });
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("contacts.title")} subtitle={t("contacts.subtitle")} />
      <ListSearch className="mt-6" placeholder={t("common.search")} filters={[{ key: "category", label: t("contacts.fields.category"), options: CONTACT_CATEGORIES.map((c) => ({ value: c, label: t(`enums.contactCategory.${c}`) })) }]} />
      <ContactsView
        canManage={ctx.can("contacts.manage")}
        focus={sp.focus ?? null}
        total={data.total}
        page={page}
        rows={data.rows.map((c) => ({
          id: c.id, name: L(c.nameEn, c.nameAr), nameEn: c.nameEn, nameAr: c.nameAr, category: c.category, type: c.type, companyName: c.companyName, jobTitle: c.jobTitle,
          email: c.email, phone: c.phone, whatsapp: c.whatsapp, address: c.address, notes: c.notes, clientId: c.clientId,
          client: c.client ? L(c.client.nameEn, c.client.nameAr) : null,
          matters: c.parties.map((p) => ({ id: p.matter.id, number: p.matter.internalNumber, role: p.role })),
          relations: [
            ...c.relationsFrom.map((r) => ({ id: r.to.id, name: L(r.to.nameEn, r.to.nameAr), label: r.label, dir: "out" as const })),
            ...c.relationsTo.map((r) => ({ id: r.from.id, name: L(r.from.nameEn, r.from.nameAr), label: r.label, dir: "in" as const })),
          ],
        }))}
      />
    </div>
  );
}

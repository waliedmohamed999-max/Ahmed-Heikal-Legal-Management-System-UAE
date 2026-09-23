import Link from "next/link";
import { Users, Plus, Building2, User } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { notFound } from "next/navigation";
import { listClients, clientListQuery } from "@/server/services/clients";
import { PageHeader, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatMoney, relativeTime } from "@/lib/time";
import { ListSearch } from "@/components/list-search";
import { Pager } from "../cases/toolbar";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("clients.view")) notFound();
  const { t, locale } = await getT();
  const q = clientListQuery.parse(await searchParams);
  const data = await listClients(ctx, q);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("clients.title")} subtitle={t("clients.subtitle")}
        actions={ctx.can("clients.create") && <Button asChild variant="primary"><Link href="/app/clients/new"><Plus /> {t("clients.new")}</Link></Button>} />
      <ListSearch
        className="mt-6"
        placeholder={t("clients.searchPlaceholder")}
        filters={[
          { key: "type", label: t("clients.fields.type"), options: ["COMPANY", "INDIVIDUAL"].map((v) => ({ value: v, label: t(`enums.partyType.${v}`) })) },
          { key: "status", label: t("common.status"), options: ["ACTIVE", "INACTIVE", "PROSPECT"].map((v) => ({ value: v, label: t(`enums.clientStatus.${v}`) })) },
        ]}
      />
      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        {data.rows.length === 0 ? (
          <EmptyState icon={<Users />} title={q.q || q.type || q.status ? t("clients.empty") : t("clients.emptyFirst")} body={q.q ? undefined : t("clients.emptyFirstBody")}
            action={ctx.can("clients.create") && !q.q && <Button asChild size="sm" variant="primary"><Link href="/app/clients/new"><Plus /> {t("clients.new")}</Link></Button>} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t("clients.col.client")}</TH>
                  <TH className="hidden md:table-cell">{t("clients.col.contact")}</TH>
                  <TH>{t("clients.col.activeMatters")}</TH>
                  {ctx.can("finance.view") && <TH className="hidden sm:table-cell">{t("clients.col.outstanding")}</TH>}
                  <TH className="hidden lg:table-cell">{t("clients.col.lastContact")}</TH>
                  <TH className="hidden sm:table-cell">{t("clients.col.status")}</TH>
                </tr>
              </THead>
              <tbody>
                {data.rows.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/app/clients/${c.id}`} className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink-subtle">{c.type === "COMPANY" ? <Building2 className="size-4" /> : <User className="size-4" />}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink hover:underline">{L(c.nameEn, c.nameAr)}</span>
                          <span className="ltr-nums block font-mono text-[11.5px] text-ink-subtle">{c.clientNumber}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="hidden text-ink-muted md:table-cell"><span className="ltr-nums block">{c.email ?? "—"}</span><span className="ltr-nums block text-[12px] text-ink-subtle">{c.phone}</span></TD>
                    <TD className="tabular text-ink">{c.activeMatters}</TD>
                    {ctx.can("finance.view") && <TD className={`ltr-nums hidden tabular sm:table-cell ${c.outstanding ? "font-medium text-warning" : "text-ink-subtle"}`}>{c.outstanding ? formatMoney(c.outstanding, locale, ctx.org.currency) : "—"}</TD>}
                    <TD className="hidden text-ink-muted lg:table-cell">{c.lastContactAt ? relativeTime(c.lastContactAt, locale) : "—"}</TD>
                    <TD className="hidden sm:table-cell"><Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{t(`enums.clientStatus.${c.status}`)}</Badge></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pager total={data.total} page={q.page} pageSize={25} />
          </>
        )}
      </div>
    </div>
  );
}

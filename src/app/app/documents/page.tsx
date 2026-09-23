import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { docListQuery, listDocuments } from "@/server/services/documents";
import { PageHeader } from "@/components/ui/layout";
import { ListSearch } from "@/components/list-search";
import { DocumentTable } from "@/components/document-table";
import { Pager } from "../cases/toolbar";

export const metadata = { title: "Documents" };
const CATEGORIES = ["COURT", "CLIENT", "EVIDENCE", "CONTRACT", "LEGAL_MEMO", "CORRESPONDENCE", "JUDGMENT", "INVOICE", "POWER_OF_ATTORNEY", "EXPERT_REPORT", "SUBMISSION", "OTHER"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("documents.view")) notFound();
  const { t } = await getT();
  const sp = await searchParams;
  const q = docListQuery.parse(sp);
  const data = await listDocuments(ctx, q);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("documents.title")} subtitle={t("documents.subtitle")} />
      <ListSearch className="mt-6" placeholder={t("documents.searchPlaceholder")} filters={[
        { key: "category", label: t("documents.fields.category"), options: CATEGORIES.map((c) => ({ value: c, label: t(`enums.documentCategory.${c}`) })) },
        { key: "status", label: t("common.status"), options: ["DRAFT", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SUBMITTED"].map((s) => ({ value: s, label: t(`enums.documentStatus.${s}`) })) },
      ]} />
      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        <DocumentTable rows={data.rows} canUpload={ctx.can("documents.upload")} autoOpenUpload={sp.upload === "1"} emptyTitle={q.q || q.category || q.status ? t("documents.noMatch") : undefined} />
        {data.rows.length > 0 && <Pager total={data.total} page={q.page} pageSize={30} />}
      </div>
    </div>
  );
}

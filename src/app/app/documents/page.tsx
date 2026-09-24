import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { docListQuery, listDocuments } from "@/server/services/documents";
import { Page, PageHeader } from "@/components/ui/layout";
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
    <Page width="full" className="max-w-[1600px]">
      <PageHeader title={<span className="flex items-baseline gap-2">{t("documents.title")}<span className="text-body font-normal tabular text-ink-subtle">{data.total}</span></span>} subtitle={t("documents.subtitle")} />
      <div className="mt-4">
        <DocumentTable
          rows={data.rows} canUpload={ctx.can("documents.upload")} autoOpenUpload={sp.upload === "1"} emptyTitle={q.q || q.category || q.status ? t("documents.noMatch") : undefined}
          toolbar={<ListSearch key="toolbar" placeholder={t("documents.searchPlaceholder")} filters={[
        { key: "category", label: t("documents.fields.category"), options: CATEGORIES.map((c) => ({ value: c, label: t(`enums.documentCategory.${c}`) })) },
        { key: "status", label: t("common.status"), options: ["DRAFT", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SUBMITTED"].map((s) => ({ value: s, label: t(`enums.documentStatus.${s}`) })) },
      ]} />}
          footer={<Pager key="pager" total={data.total} page={q.page} pageSize={30} />}
        />
      </div>
    </Page>
  );
}

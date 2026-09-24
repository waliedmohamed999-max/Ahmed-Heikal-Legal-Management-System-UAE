import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { docListQuery, listDocuments } from "@/server/services/documents";
import { ListSearch } from "@/components/list-search";
import { DocumentTable } from "@/components/document-table";

export default async function CaseDocumentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const { t, locale } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  if (!ws.caps.includes("documents.view")) notFound();
  const q = docListQuery.parse(sp);
  const data = await listDocuments(ctx, { ...q, page: 1 }, id);
  const m = ws.matter;
  return (
    <div>
        <DocumentTable
          toolbar={<ListSearch placeholder={t("documents.searchPlaceholder")} filters={[{ key: "status", label: t("common.status"), options: ["DRAFT", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SUBMITTED"].map((s) => ({ value: s, label: t(`enums.documentStatus.${s}`) })) }]} />}
          rows={data.rows}
          showMatter={false}
          canUpload={ws.caps.includes("documents.upload")}
          matterId={id}
          matterLabel={m.internalNumber}
          autoOpenUpload={sp.upload === "1"}
          suggest={{ number: m.internalNumber, client: locale === "ar" ? m.client.nameEn : m.client.nameEn }}
        />
    </div>
  );
}

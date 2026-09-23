import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { listKnowledge } from "@/server/services/knowledge";
import { KNOWLEDGE_KINDS } from "@/lib/templates";
import { PageHeader } from "@/components/ui/layout";
import { ListSearch } from "@/components/list-search";
import { KnowledgeView } from "./view";

export const metadata = { title: "Legal Knowledge" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("knowledge.view")) notFound();
  const { t } = await getT();
  const sp = await searchParams;
  const kind = (KNOWLEDGE_KINDS as readonly string[]).includes(sp.kind ?? "") ? sp.kind : undefined;
  const rows = await listKnowledge(ctx, sp.q?.trim() || undefined, kind);
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("knowledge.title")} subtitle={t("knowledge.subtitle")} />
      <ListSearch className="mt-5" placeholder={t("knowledge.search")} filters={[{ key: "kind", label: t("common.type"), options: KNOWLEDGE_KINDS.map((k) => ({ value: k, label: t(`knowledge.kinds.${k}`) })) }]} />
      <KnowledgeView
        canManage={ctx.can("knowledge.manage")}
        rows={rows.map((r) => ({ id: r.id, kind: r.kind as (typeof KNOWLEDGE_KINDS)[number], title: r.title, body: r.body, tags: r.tags.join(", "), locale: r.locale as "ar" | "en", confidentiality: r.confidentiality as "STANDARD" | "CONFIDENTIAL", updatedAt: r.updatedAt.toISOString() }))}
      />
    </div>
  );
}

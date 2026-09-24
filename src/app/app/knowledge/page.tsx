import { stringList } from "@/lib/json-lists";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { listKnowledge } from "@/server/services/knowledge";
import { KNOWLEDGE_KINDS } from "@/lib/templates";
import { Page, PageHeader } from "@/components/ui/layout";
import { ListSearch } from "@/components/list-search";
import { KnowledgeView } from "./view";

export const metadata = { title: "Legal Knowledge" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const ctx = await requireStaff();
  if (!ctx.can("knowledge.view")) notFound();
  const { t } = await getT();
  const sp = await searchParams;
  const kind = (KNOWLEDGE_KINDS as readonly string[]).includes(sp.kind ?? "") ? sp.kind : undefined;
  const [rows, all] = await Promise.all([listKnowledge(ctx, sp.q?.trim() || undefined, kind), listKnowledge(ctx, sp.q?.trim() || undefined)]);
  const counts = all.reduce<Record<string, number>>((a, r) => ((a[r.kind] = (a[r.kind] ?? 0) + 1), a), {});
  return (
    <Page width="full" className="max-w-[1500px]">
      <PageHeader title={t("knowledge.title")} subtitle={t("knowledge.subtitle")} />
      <ListSearch className="mt-4" placeholder={t("knowledge.search")} />
      <KnowledgeView
        kind={kind ?? null}
        counts={counts}
        canManage={ctx.can("knowledge.manage")}
        rows={rows.map((r) => ({ id: r.id, kind: r.kind as (typeof KNOWLEDGE_KINDS)[number], title: r.title, body: r.body, tags: stringList(r.tags).join(", "), locale: r.locale as "ar" | "en", confidentiality: r.confidentiality as "STANDARD" | "CONFIDENTIAL", updatedAt: r.updatedAt.toISOString() }))}
      />
    </Page>
  );
}

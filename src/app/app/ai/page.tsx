import { notFound } from "next/navigation";
import { Sparkles, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { aiStatus } from "@/server/services/ai/provider";
import { matterAccess } from "@/server/services/access";
import { documentScope } from "@/server/services/documents";
import { Page, PageHeader } from "@/components/ui/layout";
import { AiWorkbench } from "./workbench";

export const metadata = { title: "AI Assistant" };

export default async function AiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("ai.use")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const status = aiStatus(ctx);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);

  let matter: { id: string; label: string } | null = null;
  let docs: { id: string; title: string; pages: number | null; textStatus: string }[] = [];
  if (sp.matter && /^[0-9a-f-]{36}$/i.test(sp.matter)) {
    const acc = await matterAccess(ctx, sp.matter);
    if (acc.has("ai.use") && acc.matter) {
      matter = { id: sp.matter, label: `${acc.matter.internalNumber} · ${L(acc.matter.title, acc.matter.titleAr)}` };
      if (acc.has("documents.view")) {
        const rows = await db.document.findMany({ where: { AND: [documentScope(ctx), { matterId: sp.matter }] }, orderBy: { updatedAt: "desc" }, include: { versions: { orderBy: { version: "desc" }, take: 1, select: { pageCount: true, textStatus: true } } } });
        docs = rows.map((d) => ({ id: d.id, title: d.title, pages: d.versions[0]?.pageCount ?? null, textStatus: d.versions[0]?.textStatus ?? "PENDING" }));
      }
    }
  }
  const jobs = await db.aIJob.findMany({ where: { organizationId: ctx.org.id, userId: ctx.user.id }, orderBy: { createdAt: "desc" }, take: 20, include: { matter: { select: { internalNumber: true } } } });

  return (
    <Page width="full" className="max-w-[1500px]">
      <PageHeader title={t("ai.title")} subtitle={t("ai.subtitle")} />
      <p className="mt-2 flex items-center gap-1.5 text-meta text-ink-muted"><ShieldAlert className="size-3.5 shrink-0 text-warning" aria-hidden /> {t("ai.disclaimer")}</p>
      {!status.keyConfigured ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-canvas px-4 py-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden /><div><p className="text-body font-medium text-ink">{t("ai.notConfigured")}</p><p className="text-meta text-ink-muted">{t("ai.notConfiguredBody")}</p></div></div>
      ) : !status.enabled ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-canvas px-4 py-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden /><div><p className="text-body font-medium text-ink">{t("ai.disabled")}</p><p className="text-meta text-ink-muted">{t("ai.disabledBody")}</p></div></div>
      ) : null}
      <AiWorkbench
        available={status.keyConfigured && status.enabled}
        allowDocuments={status.allowDocuments}
        matter={matter}
        documents={docs}
        preset={{ task: sp.task ?? null, document: sp.document ?? null, hearing: sp.hearing ?? null }}
        jobs={jobs.map((j) => ({
          id: j.id, kind: j.kind, status: j.status, reviewStatus: j.reviewStatus, output: j.output, structured: j.structured as Record<string, unknown[]> | null,
          citations: (j.citations as { document: string; documentId: string | null; page: number | null; quote: string }[] | null) ?? [], error: j.error,
          createdAt: j.createdAt.toISOString(), matter: j.matter?.internalNumber ?? null, tokens: (j.inputTokens ?? 0) + (j.outputTokens ?? 0),
        }))}
      />
    </Page>
  );
}

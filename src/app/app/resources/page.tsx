import { ExternalLink, Landmark } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { PageHeader, Panel } from "@/components/ui/layout";

export const metadata = { title: "UAE Legal Resources" };

export default async function ResourcesPage() {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const rows = await db.legalResource.findMany({ where: { organizationId: ctx.org.id }, orderBy: [{ category: "asc" }, { order: "asc" }] });
  const groups = Object.entries(rows.reduce<Record<string, typeof rows>>((a, r) => ((a[r.category] ??= []).push(r), a), {}));
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("resources.title")} subtitle={t("resources.subtitle")} />
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        {groups.map(([cat, list]) => (
          <Panel key={cat} title={t(`resources.categories.${cat}`)} icon={<Landmark />}>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <li key={r.id}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted/60">
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-medium text-ink">{locale === "ar" ? r.titleAr || r.title : r.title}</p>
                      <p className="ltr-nums truncate text-meta text-ink-subtle">{r.url.replace(/^https?:\/\//, "")}</p>
                    </div>
                    <ExternalLink className="size-4 text-ink-subtle rtl:-scale-x-100" />
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}

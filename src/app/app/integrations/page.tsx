import Link from "next/link";
import { notFound } from "next/navigation";
import { Plug, Landmark, FileInput, Info } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { channelStatus } from "@/server/services/channels";
import { PageHeader, Panel } from "@/components/ui/layout";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/time";

export const metadata = { title: "Integrations" };
const TONE: Record<string, Tone> = { CONNECTED: "success", NOT_CONNECTED: "neutral", REQUIRES_CONFIGURATION: "warning", UNSUPPORTED: "outline", ERROR: "danger" };

export default async function IntegrationsPage() {
  const ctx = await requireStaff();
  if (!ctx.can("integrations.manage")) notFound();
  const { t, locale } = await getT();
  const rows = await db.integration.findMany({ where: { organizationId: ctx.org.id }, orderBy: [{ category: "asc" }, { provider: "asc" }] });
  const ch = channelStatus();
  // Live status for env-configured adapters overrides the stored value — the page never claims a connection that doesn't exist.
  const live: Record<string, boolean | undefined> = { SMTP: ch.EMAIL, SMS: ch.SMS, WHATSAPP_BUSINESS: ch.WHATSAPP, AI_PROVIDER: !!process.env.ANTHROPIC_API_KEY, S3_STORAGE: process.env.STORAGE_DRIVER === "s3" ? false : undefined };
  const status = (r: (typeof rows)[number]) => (live[r.provider] === true ? "CONNECTED" : live[r.provider] === false && r.status === "CONNECTED" ? "REQUIRES_CONFIGURATION" : r.status);
  const groups = Object.entries(rows.reduce<Record<string, typeof rows>>((a, r) => ((a[r.category] ??= []).push(r), a), {}));
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("integrations.title")} subtitle={t("integrations.subtitle")} actions={<Button asChild variant="secondary"><Link href="/app/integrations/import"><FileInput /> {t("integrations.importCta")}</Link></Button>} />
      <p className="mt-5 flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-meta text-ink-muted"><Landmark className="mt-0.5 size-4 shrink-0 text-ink-subtle" /> {t("integrations.govNote")}</p>
      <div className="mt-5 space-y-5">
        {groups.map(([cat, list]) => (
          <Panel key={cat} title={t(`integrations.categories.${cat}`)} icon={<Plug />}>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">{t(`integrations.providers.${r.provider}`)}</p>
                    {r.statusDetail && <p className="text-meta text-ink-subtle" dir="ltr">{r.statusDetail}</p>}
                    {r.provider === "WHATSAPP_BUSINESS" && <p className="mt-0.5 flex items-center gap-1 text-meta text-ink-subtle"><Info className="size-3" /> {t("integrations.whatsappNote")}</p>}
                  </div>
                  {r.lastCheckedAt && <span className="text-meta text-ink-subtle">{t("integrations.lastChecked")} {relativeTime(r.lastCheckedAt, locale)}</span>}
                  <Badge tone={TONE[status(r)]}>{t(`enums.integrationStatus.${status(r)}`)}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}

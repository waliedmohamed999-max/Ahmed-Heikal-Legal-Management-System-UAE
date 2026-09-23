import { Briefcase, CalendarDays, FileText, Receipt, Download, Gavel } from "lucide-react";
import { requireClient } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getPortalHome } from "@/server/services/portal";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Badge, INVOICE_STATUS_TONE, MATTER_STATUS_TONE } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/time";
import { PortalMessages, PortalUpload } from "./client";

export const metadata = { title: "Client Portal" };

export default async function PortalHome() {
  const ctx = await requireClient();
  const { t, locale } = await getT();
  const d = await getPortalHome(ctx);
  const tz = ctx.org.timezone;
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t("portal.welcome", { name: L(ctx.user.name, ctx.user.nameAr) })}</h1>
        <p className="mt-1 text-[13px] text-ink-muted">{t("portal.intro")}</p>
      </div>

      <Panel title={t("portal.myCases")} icon={<Briefcase />}>
        {d.matters.length === 0 ? <EmptyState compact title={t("portal.noCases")} /> : (
          <ul className="divide-y divide-line">
            {d.matters.map((m) => (
              <li key={m.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{L(m.title, m.titleAr)}</p>
                    <p className="ltr-nums text-[12px] text-ink-subtle">{m.internalNumber}{m.officialCaseNumber && ` · ${t("portal.caseNumber")} ${m.officialCaseNumber}`}{m.court && ` · ${L(m.court.name, m.court.nameAr)}`}</p>
                  </div>
                  <Badge tone={MATTER_STATUS_TONE[m.status]}>{t(`enums.matterStatus.${m.status}`)}</Badge>
                </div>
                {m.portalStatusText && <p className="rounded-md bg-surface-muted p-3 text-[13.5px] text-ink">{m.portalStatusText}</p>}
                {m.hearings[0] && <p className="flex items-center gap-1.5 text-[13px] text-ink-muted"><Gavel className="size-4 text-ev-hearing" /> {t("portal.nextHearing")}: {formatDateTime(m.hearings[0].startsAt, locale, tz)}</p>}
                {m.notes.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">{t("portal.latestUpdate")}</p>
                    <ul className="space-y-1.5">{m.notes.map((n) => <li key={n.id} className="text-[13px] text-ink"><span className="text-[11.5px] text-ink-subtle">{formatDate(n.createdAt, locale, tz)} — </span>{n.body}</li>)}</ul>
                  </div>
                )}
                {m.documents.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle"><FileText className="size-3.5" /> {t("portal.documents")}</p>
                    <ul className="divide-y divide-line rounded-md border border-line">
                      {m.documents.map((doc) => (
                        <li key={doc.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                          <span className="flex-1 truncate">{doc.title}</span>
                          {doc.versions[0] && <a href={`/api/portal/files/${doc.versions[0].id}`} className="inline-flex items-center gap-1 text-accent hover:underline"><Download className="size-3.5" /> {t("portal.download")}</a>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <PortalUpload matterId={m.id} />
                <PortalMessages matterId={m.id} messages={d.messages.filter((x) => x.matterId === m.id).map((x) => ({ id: x.id, body: x.body ?? "", mine: x.direction === "INBOUND", at: x.occurredAt.toISOString() }))} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={t("portal.appointments")} icon={<CalendarDays />}>
          {d.appointments.length === 0 ? <EmptyState compact title={t("portal.noItems")} /> : (
            <ul className="divide-y divide-line">
              {d.appointments.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-[13px]">
                  <p className="font-medium text-ink">{a.title}</p>
                  <p className="text-[12px] text-ink-muted">{formatDateTime(a.startsAt, locale, tz)} · {a.meetingUrl ? <a href={a.meetingUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{t("site.modes.ONLINE")}</a> : a.location}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t("portal.invoices")} icon={<Receipt />}>
          {d.invoices.length === 0 ? <EmptyState compact title={t("portal.noItems")} /> : (
            <ul className="divide-y divide-line">
              {d.invoices.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                  <span className="ltr-nums flex-1 font-mono">{i.number}</span>
                  <span className="text-[12px] text-ink-subtle">{formatDate(i.dueDate, locale, tz)}</span>
                  <span className="ltr-nums tabular">{formatMoney(Number(i.total), locale, i.currency)}</span>
                  {Number(i.total) - Number(i.amountPaid) > 0 && i.status !== "PAID" && (
                    <span className="text-[12px] text-warning">{t("finance.outstanding")}: <span className="ltr-nums tabular">{formatMoney(Number(i.total) - Number(i.amountPaid), locale, i.currency)}</span></span>
                  )}
                  <Badge tone={INVOICE_STATUS_TONE[i.status]}>{t(`enums.invoiceStatus.${i.status}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

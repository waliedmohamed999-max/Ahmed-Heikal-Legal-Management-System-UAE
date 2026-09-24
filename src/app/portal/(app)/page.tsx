import { CalendarDays, FileText, Download, Gavel, Video, MapPin } from "lucide-react";
import { requireClient } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getPortalHome } from "@/server/services/portal";
import { EmptyState } from "@/components/ui/layout";
import { StatusText, INVOICE_STATUS_TONE, MATTER_STATUS_TONE } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/time";
import { PortalMessages, PortalUpload } from "./client";

export const metadata = { title: "Client Portal" };

/** Client portal home: status first, then what's next, documents, invoices. No internal complexity. */
export default async function PortalHome() {
  const ctx = await requireClient();
  const { t, locale } = await getT();
  const d = await getPortalHome(ctx);
  const tz = ctx.org.timezone;
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const docs = d.matters.flatMap((m) => m.documents.map((doc) => ({ ...doc, matter: m.internalNumber }))).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 8);
  const upcoming = [
    ...d.matters.filter((m) => m.hearings[0]).map((m) => ({ key: `h-${m.id}`, at: m.hearings[0].startsAt, title: `${t("portal.nextHearing")} — ${L(m.title, m.titleAr)}`, icon: Gavel, where: m.court ? L(m.court.name, m.court.nameAr) : null, url: null as string | null })),
    ...d.appointments.map((a) => ({ key: `a-${a.id}`, at: a.startsAt, title: a.title, icon: a.meetingUrl ? Video : CalendarDays, where: a.location, url: a.meetingUrl })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const H2 = "border-b border-line pb-2 text-heading font-semibold text-ink";

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-title font-semibold tracking-tight text-ink">{t("portal.welcome", { name: L(ctx.user.name, ctx.user.nameAr) })}</h1>
        <p className="mt-1 text-body text-ink-muted">{t("portal.intro")}</p>
      </header>

      {/* Case status */}
      <section aria-labelledby="cases">
        <h2 id="cases" className={H2}>{t("portal.myCases")}</h2>
        {d.matters.length === 0 ? <EmptyState compact title={t("portal.noCases")} /> : (
          <div className="mt-4 space-y-6">
            {d.matters.map((m) => (
              <article key={m.id} className="rounded-lg border border-line">
                <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
                  <div className="min-w-0">
                    <h3 className="bidi-plain text-ui font-semibold text-ink">{L(m.title, m.titleAr)}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-meta text-ink-subtle">
                      <span className="record-id">{m.internalNumber}</span>
                      {m.officialCaseNumber && <span>· {t("portal.caseNumber")} <span className="record-id">{m.officialCaseNumber}</span></span>}
                      {m.court && <span>· {L(m.court.name, m.court.nameAr)}</span>}
                    </p>
                  </div>
                  <StatusText tone={MATTER_STATUS_TONE[m.status]}>{t(`enums.matterStatus.${m.status}`)}</StatusText>
                </div>
                {m.portalStatusText && <p className="bidi-plain mx-5 mt-3 border-s-2 border-accent ps-3 text-ui leading-relaxed text-ink">{m.portalStatusText}</p>}
                <dl className="mx-5 mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-meta text-ink-subtle">{t("portal.nextHearing")}</dt>
                    <dd className="mt-0.5 text-body text-ink">{m.hearings[0] ? formatDateTime(m.hearings[0].startsAt, locale, tz) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-meta text-ink-subtle">{t("portal.latestUpdate")}</dt>
                    <dd className="mt-0.5 text-body text-ink">{m.notes[0] ? <><span className="text-ink-subtle">{formatDate(m.notes[0].createdAt, locale, tz)} — </span><span className="bidi-plain">{m.notes[0].body}</span></> : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-4 space-y-3 border-t border-line px-5 py-4">
                  <PortalMessages matterId={m.id} messages={d.messages.filter((x) => x.matterId === m.id).map((x) => ({ id: x.id, body: x.body ?? "", mine: x.direction === "INBOUND", at: x.occurredAt.toISOString() }))} />
                  <PortalUpload matterId={m.id} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <section aria-labelledby="upcoming">
          <h2 id="upcoming" className={H2}>{t("portal.appointments")}</h2>
          {upcoming.length === 0 ? <p className="mt-3 text-body text-ink-subtle">{t("portal.noItems")}</p> : (
            <ul className="mt-2">
              {upcoming.map((u) => (
                <li key={u.key} className="flex items-start gap-3 py-2">
                  <u.icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="bidi-plain text-body font-medium text-ink">{u.title}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-meta text-ink-muted">
                      {formatDateTime(u.at, locale, tz)}
                      {u.url ? <a href={u.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">· {t("site.modes.ONLINE")}</a> : u.where && <span className="inline-flex items-center gap-1">· <MapPin className="size-3" aria-hidden />{u.where}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="docs">
          <h2 id="docs" className={H2}>{t("portal.documents")}</h2>
          {docs.length === 0 ? <p className="mt-3 text-body text-ink-subtle">{t("portal.noItems")}</p> : (
            <ul className="mt-2">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 py-2">
                  <FileText className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="bidi-plain truncate text-body text-ink">{doc.title}</p>
                    <p className="text-meta text-ink-subtle">{formatDate(doc.updatedAt, locale, tz)}</p>
                  </div>
                  {doc.versions[0] && <a href={`/api/portal/files/${doc.versions[0].id}`} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-meta font-medium text-accent hover:bg-accent-soft"><Download className="size-3.5" aria-hidden /> {t("portal.download")}</a>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="inv">
        <h2 id="inv" className={H2}>{t("portal.invoices")}</h2>
        {d.invoices.length === 0 ? <p className="mt-3 text-body text-ink-subtle">{t("portal.noItems")}</p> : (
          <ul className="mt-1 divide-y divide-line/80">
            {d.invoices.map((i) => {
              const due = Number(i.total) - Number(i.amountPaid);
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-body">
                  <span className="record-id text-ink">{i.number}</span>
                  <span className="text-meta text-ink-subtle">{formatDate(i.dueDate, locale, tz)}</span>
                  <span className="ms-auto ltr-nums tabular text-ink">{formatMoney(Number(i.total), locale, i.currency)}</span>
                  {due > 0 && i.status !== "PAID" && <span className="text-meta text-warning">{t("finance.outstanding")}: <span className="ltr-nums tabular">{formatMoney(due, locale, i.currency)}</span></span>}
                  <StatusText tone={INVOICE_STATUS_TONE[i.status]} className="text-meta">{t(`enums.invoiceStatus.${i.status}`)}</StatusText>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

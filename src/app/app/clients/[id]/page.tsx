import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Mail, Phone, MessageCircle, Building2, User, ChevronLeft, ChevronRight, FileText, Circle, CalendarDays } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getClient360 } from "@/server/services/clients";
import { EmptyState, Panel, DetailList, LinkTabs, Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { StatusText, PriorityText, MATTER_STATUS_TONE, DOC_STATUS_TONE, INVOICE_STATUS_TONE } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AppError } from "@/server/errors";
import { SensitiveReveal } from "./sensitive";
import { CommunicationsView } from "@/components/communications";

const TABS = ["overview", "cases", "documents", "meetings", "finance", "communications"] as const;

export default async function Client360Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const { t, locale } = await getT();
  let d;
  try {
    d = await getClient360(ctx, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const c = d.client;
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;
  const active = d.matters.filter((m) => !["CLOSED", "ARCHIVED"].includes(m.status));
  const closed = d.matters.filter((m) => ["CLOSED", "ARCHIVED"].includes(m.status));
  const Sep = locale === "ar" ? ChevronLeft : ChevronRight;
  const now = new Date();
  const showFinance = d.outstanding != null;
  const tabs = TABS.filter((k) => k !== "finance" || showFinance);
  const tab = (tabs as readonly string[]).includes(rawTab ?? "") ? (rawTab as (typeof TABS)[number]) : "overview";
  const href = (k: string) => (k === "overview" ? `/app/clients/${id}` : `/app/clients/${id}?tab=${k}`);
  const counts: Record<string, number | undefined> = { cases: d.matters.length, documents: d.documents.length, meetings: d.appointments.length, communications: d.communications.length };

  const caseRows = (list: typeof d.matters) =>
    list.length === 0 ? <EmptyState compact title={t("cases.emptyFirst")} /> : (
      <ul>
        {list.map((m) => (
          <li key={m.id}>
            <Link href={`/app/cases/${m.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted">
              <div className="min-w-0 flex-1">
                <div className="bidi-plain truncate text-body font-medium text-ink">{L(m.title, m.titleAr)}</div>
                <div className="flex items-center gap-1.5 text-meta text-ink-subtle">
                  <span className="record-id">{m.internalNumber}</span>
                  <span>· {t(`enums.matterKind.${m.kind}`)}</span>
                  {m.leadLawyer && <span className="hidden sm:inline">· {L(m.leadLawyer.name, m.leadLawyer.nameAr)}</span>}
                </div>
              </div>
              <PriorityText priority={m.priority} label={t(`enums.priority.${m.priority}`)} className="hidden text-meta sm:inline-flex" />
              <StatusText tone={MATTER_STATUS_TONE[m.status]} className="text-meta">{t(`enums.matterStatus.${m.status}`)}</StatusText>
            </Link>
          </li>
        ))}
      </ul>
    );

  const docRows = (
    d.documents.length === 0 ? <EmptyState compact icon={<FileText />} title={t("documents.empty")} /> : (
      <ul>
        {d.documents.map((doc) => (
          <li key={doc.id}>
            <Link href={`/app/documents/${doc.id}`} className="flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted">
              <FileText className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              <span className="bidi-plain min-w-0 flex-1 truncate text-body text-ink">{doc.title}</span>
              <StatusText tone={DOC_STATUS_TONE[doc.status]} className="text-meta">{t(`enums.documentStatus.${doc.status}`)}</StatusText>
            </Link>
          </li>
        ))}
      </ul>
    )
  );

  return (
    <div className="min-h-full">
      <header className="mx-auto max-w-[1320px] px-4 pt-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-meta text-ink-subtle">
          <Link href="/app/clients" className="hover:text-ink">{t("clients.title")}</Link>
          <Sep className="size-3" aria-hidden />
          <span className="record-id text-ink-muted">{c.clientNumber}</span>
        </nav>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-ink-muted">
              {c.type === "COMPANY" ? <Building2 className="size-5" aria-hidden /> : <User className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0">
              <h1 className="bidi-plain text-title font-semibold leading-snug tracking-tight text-ink">{L(c.nameEn, c.nameAr)}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-muted">
                <StatusText tone={c.status === "ACTIVE" ? "success" : "neutral"} className="text-meta">{t(`enums.clientStatus.${c.status}`)}</StatusText>
                <span className="text-ink-subtle">{t(`enums.partyType.${c.type}`)}</span>
                <span>{t("client.openCases", { n: active.length })}</span>
                {showFinance && d.outstanding! > 0 && <span className="text-warning">{t("client.outstanding", { amount: formatMoney(d.outstanding!, locale, ctx.org.currency) })}</span>}
                {c.lastContactAt && <span className="text-ink-subtle">{t("client.lastContact", { when: relativeTime(c.lastContactAt, locale) })}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-body text-ink-muted">
                {c.email && <a href={`mailto:${c.email}`} className="ltr-nums inline-flex items-center gap-1.5 hover:text-ink"><Mail className="size-3.5" aria-hidden /> {c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} className="ltr-nums inline-flex items-center gap-1.5 hover:text-ink"><Phone className="size-3.5" aria-hidden /> {c.phone}</a>}
                {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="ltr-nums inline-flex items-center gap-1.5 hover:text-ink"><MessageCircle className="size-3.5" aria-hidden /> {c.whatsapp}</a>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {ctx.can("clients.edit") && <Button asChild variant="secondary" size="sm"><Link href={`/app/clients/${id}/edit`}><Pencil /> {t("common.edit")}</Link></Button>}
            {ctx.can("matters.create") && <Button asChild variant="primary" size="sm"><Link href={`/app/cases/new?client=${id}`}><Plus /> {t("clients.c360.newCase")}</Link></Button>}
          </div>
        </div>
      </header>

      <div className="sticky top-12 z-20 mt-3 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
          <LinkTabs active={tab} tabs={tabs.map((k) => ({ key: k, href: href(k), label: t(`client.${k}`), count: counts[k] }))} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1320px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-8">
              <Panel plain title={t("clients.c360.active")} count={active.length} footer={d.hiddenMatters > 0 && <p className="px-3 text-meta text-ink-subtle">{t("clients.c360.hiddenMatters", { n: d.hiddenMatters })}</p>}>
                {caseRows(active)}
              </Panel>
              <Panel plain title={t("clients.c360.pendingTasks")} count={d.tasks.length || null}>
                {d.tasks.length === 0 ? <EmptyState compact title={t("dashboard.tasksEmpty")} /> : (
                  <ul>
                    {d.tasks.map((tk) => {
                      const overdue = !!tk.dueAt && tk.dueAt < now;
                      return (
                        <li key={tk.id}>
                          <Link href={`/app/tasks?task=${tk.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-muted">
                            <Circle className="size-4 shrink-0 text-line-strong" aria-hidden />
                            <span className="bidi-plain min-w-0 flex-1 truncate text-body text-ink">{tk.title}</span>
                            {tk.matter && <span className="record-id hidden text-ink-subtle sm:inline">{tk.matter.internalNumber}</span>}
                            {tk.dueAt && <span className={cn("w-20 shrink-0 text-end text-meta tabular", overdue ? "font-medium text-danger" : "text-ink-muted")}>{overdue ? t("common.overdue") : formatDate(tk.dueAt, locale, tz, { day: "numeric", month: "short", year: undefined })}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
              <Panel plain title={t("clients.c360.activity")}>
                {d.activity.length === 0 ? <EmptyState compact title={t("dashboard.activityEmpty")} /> : (
                  <ul>
                    {d.activity.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 px-3 py-2">
                        <Avatar name={a.actor?.name ?? "System"} size={20} className="mt-0.5" />
                        <div className="min-w-0 flex-1 text-body">
                          <span className="text-ink">{a.actor ? L(a.actor.name, a.actor.nameAr) : "—"}</span> <span className="text-ink-muted">{t(`activity.${a.type}`, a.data as Record<string, string>)}</span>
                          <div className="flex items-center gap-1.5 text-meta text-ink-subtle">{a.matter && <span className="record-id">{a.matter.internalNumber}</span>}<span>· {relativeTime(a.createdAt, locale)}</span></div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <aside className="flex min-w-0 flex-col gap-8">
              <Panel plain title={t("client.details")}>
                <DetailList
                  items={[
                    { key: "lang", label: t("clients.fields.preferredLanguage"), value: c.preferredLanguage === "ar" ? t("clients.langAr") : t("clients.langEn") },
                    { key: "src", label: t("clients.fields.source"), value: c.source ? t(`clients.sources.${c.source}`) : "—" },
                    c.type === "COMPANY"
                      ? { key: "lic", label: t("clients.fields.tradeLicenseNo"), value: <span className="record-id">{c.tradeLicenseNo ?? "—"}</span> }
                      : { key: "nat", label: t("clients.fields.nationality"), value: c.nationality ?? "—" },
                    ...(c.address ? [{ key: "addr", label: t("clients.fields.address"), value: <span className="bidi-plain">{c.address}</span> }] : []),
                    { key: "created", label: t("common.createdAt"), value: formatDate(c.createdAt, locale, tz) },
                    ...(showFinance ? [{ key: "out", label: t("clients.c360.outstanding"), value: <span className="ltr-nums">{formatMoney(d.outstanding!, locale, ctx.org.currency)}</span> }] : []),
                  ]}
                />
                {c.hasSensitive && <div className="mt-3"><SensitiveReveal id={id} canView={d.canViewSensitive} /></div>}
                {c.notes && <p className="bidi-plain mt-3 whitespace-pre-line rounded-md bg-surface-muted px-3 py-2 text-body text-ink-muted">{c.notes}</p>}
              </Panel>
              <Panel plain title={t("clients.c360.contacts")} count={c.contacts.length || null}>
                {c.contacts.length === 0 ? <p className="px-3 text-body text-ink-subtle">—</p> : (
                  <ul>
                    {c.contacts.map((p) => (
                      <li key={p.id} className="px-3 py-1.5">
                        <div className="bidi-plain text-body text-ink">{L(p.nameEn, p.nameAr)}</div>
                        <div className="ltr-nums truncate text-meta text-ink-subtle">{[p.jobTitle, p.email, p.phone].filter(Boolean).join(" · ")}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel plain title={t("clients.c360.portal")}>
                {c.portalUsers.length === 0 ? <p className="px-3 text-body text-ink-muted">{t("clients.c360.noPortal")}</p> : (
                  <ul>
                    {c.portalUsers.map((u) => (
                      <li key={u.id} className="px-3 py-1.5 text-body"><span className="ltr-nums text-ink">{u.email}</span> <span className="text-meta text-ink-subtle">· {u.lastLoginAt ? relativeTime(u.lastLoginAt, locale) : "—"}</span></li>
                    ))}
                  </ul>
                )}
              </Panel>
            </aside>
          </div>
        )}

        {tab === "cases" && (
          <div className="max-w-4xl space-y-8">
            <Panel plain title={t("clients.c360.active")} count={active.length}>{caseRows(active)}</Panel>
            {closed.length > 0 && <Panel plain title={t("clients.c360.closed")} count={closed.length}>{caseRows(closed)}</Panel>}
          </div>
        )}

        {tab === "documents" && <div className="max-w-4xl"><Panel plain title={t("client.documents")} count={d.documents.length}>{docRows}</Panel></div>}

        {tab === "meetings" && (
          <div className="max-w-4xl">
            <Panel plain title={t("clients.c360.appointments")} count={d.appointments.length}>
              {d.appointments.length === 0 ? <EmptyState compact icon={<CalendarDays />} title="—" /> : (
                <ul>
                  {d.appointments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                      <CalendarDays className="size-4 shrink-0 text-ev-client-meeting" aria-hidden />
                      <span className="bidi-plain min-w-0 flex-1 truncate text-body text-ink">{a.title}</span>
                      <span className="text-meta text-ink-subtle">{t(`enums.appointmentType.${a.type}`)}</span>
                      <span className="w-40 shrink-0 text-end text-meta tabular text-ink-muted">{formatDateTime(a.startsAt, locale, tz)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}

        {tab === "finance" && showFinance && (
          <div className="max-w-4xl">
            <div className="rounded-lg border border-line">
              {d.invoices.length === 0 ? <EmptyState compact title="—" /> : (
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("finance.invoice")}</TH>
                      <TH className="text-end">{t("common.total")}</TH>
                      <TH>{t("common.status")}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {d.invoices.map((i) => (
                      <TR key={i.id}>
                        <TD><Link href={`/app/finance/invoices/${i.id}`} className="record-id text-ink hover:underline">{i.number}</Link></TD>
                        <TD className="text-end"><span className="ltr-nums tabular text-ink">{formatMoney(i.total, locale, ctx.org.currency)}</span></TD>
                        <TD><StatusText tone={INVOICE_STATUS_TONE[i.status]}>{t(`enums.invoiceStatus.${i.status}`)}</StatusText></TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </div>
        )}

        {tab === "communications" && (
          <div className="max-w-4xl">
            <CommunicationsView clientId={id} canLog={ctx.can("communications.manage")} items={d.communications.map((x) => ({ id: x.id, channel: x.channel, direction: x.direction, subject: x.subject, body: x.body, occurredAt: x.occurredAt.toISOString(), user: null }))} />
          </div>
        )}
      </div>
    </div>
  );
}

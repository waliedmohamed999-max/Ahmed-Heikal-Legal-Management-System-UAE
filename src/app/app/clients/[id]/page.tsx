import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, CheckSquare, FileText, CalendarDays, Wallet, Activity, Contact, Pencil, Plus, Mail, Phone, MessageCircle, Building2, User, Globe, ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getClient360 } from "@/server/services/clients";
import { Panel, EmptyState, Meta } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge, PRIORITY_TONE, MATTER_STATUS_TONE, DOC_STATUS_TONE, INVOICE_STATUS_TONE } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatMoney, relativeTime } from "@/lib/time";
import { AppError } from "@/server/errors";
import { SensitiveReveal } from "./sensitive";
import { CommunicationsView } from "@/components/communications";

export default async function Client360Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
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
  const Back = locale === "ar" ? ChevronRight : ChevronLeft;
  const now = new Date();

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/app/clients" className="inline-flex items-center gap-1 text-[12.5px] text-ink-subtle hover:text-ink"><Back className="size-3.5" /> {t("clients.title")}</Link>
      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-fg">{c.type === "COMPANY" ? <Building2 className="size-6" /> : <User className="size-6" />}</span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-[22px]">{L(c.nameEn, c.nameAr)}</h1>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              <span className="ltr-nums font-mono">{c.clientNumber}</span> · {t(`enums.partyType.${c.type}`)} · <Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{t(`enums.clientStatus.${c.status}`)}</Badge>
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[13px] text-ink-muted">
              {c.email && <a href={`mailto:${c.email}`} className="ltr-nums inline-flex items-center gap-1 hover:text-ink"><Mail className="size-3.5" /> {c.email}</a>}
              {c.phone && <a href={`tel:${c.phone}`} className="ltr-nums inline-flex items-center gap-1 hover:text-ink"><Phone className="size-3.5" /> {c.phone}</a>}
              {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="ltr-nums inline-flex items-center gap-1 hover:text-ink"><MessageCircle className="size-3.5" /> {c.whatsapp}</a>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {ctx.can("clients.edit") && <Button asChild variant="secondary" size="sm"><Link href={`/app/clients/${id}/edit`}><Pencil /> {t("common.edit")}</Link></Button>}
          {ctx.can("matters.create") && <Button asChild variant="primary" size="sm"><Link href={`/app/cases/new?client=${id}`}><Plus /> {t("clients.c360.newCase")}</Link></Button>}
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-xs sm:grid-cols-3 lg:grid-cols-6">
        {[
          [t("clients.c360.active"), active.length],
          [t("clients.c360.closed"), closed.length],
          [t("clients.c360.pendingTasks"), d.tasks.length],
          [t("clients.c360.documents"), d.documents.length],
          [t("clients.c360.outstanding"), d.outstanding == null ? "—" : formatMoney(d.outstanding, locale, ctx.org.currency)],
          [t("clients.c360.lastContact"), c.lastContactAt ? relativeTime(c.lastContactAt, locale) : "—"],
        ].map(([k, v]) => (
          <div key={k as string} className="bg-surface px-4 py-3">
            <dt className="text-[11.5px] text-ink-subtle">{k}</dt>
            <dd className="ltr-nums mt-0.5 text-lg font-semibold tabular text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <div className="flex flex-col gap-5 xl:col-span-8">
          <Panel title={t("clients.c360.active")} icon={<Briefcase />} footer={d.hiddenMatters > 0 && <p className="text-[12px] text-ink-subtle">{t("clients.c360.hiddenMatters", { n: d.hiddenMatters })}</p>}>
            {d.matters.length === 0 ? <EmptyState compact title={t("cases.emptyFirst")} /> : (
              <ul className="divide-y divide-line">
                {[...active, ...closed].map((m) => (
                  <li key={m.id}>
                    <Link href={`/app/cases/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted/60">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-ink">{L(m.title, m.titleAr)}</div>
                        <div className="text-[12px] text-ink-subtle"><span className="ltr-nums font-mono">{m.internalNumber}</span> · {t(`enums.matterKind.${m.kind}`)}{m.leadLawyer && ` · ${L(m.leadLawyer.name, m.leadLawyer.nameAr)}`}</div>
                      </div>
                      <Badge tone={PRIORITY_TONE[m.priority]}>{t(`enums.priority.${m.priority}`)}</Badge>
                      <Badge tone={MATTER_STATUS_TONE[m.status]}>{t(`enums.matterStatus.${m.status}`)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-5 md:grid-cols-2">
            <Panel title={t("clients.c360.pendingTasks")} icon={<CheckSquare />}>
              {d.tasks.length === 0 ? <EmptyState compact title={t("dashboard.tasksEmpty")} /> : (
                <ul className="divide-y divide-line">
                  {d.tasks.map((tk) => (
                    <li key={tk.id} className="px-4 py-2.5 text-[13px]">
                      <Link href={`/app/tasks?task=${tk.id}`} className="block truncate text-ink hover:underline">{tk.title}</Link>
                      <div className="text-[12px] text-ink-subtle">{tk.matter?.internalNumber}{tk.dueAt && ` · ${formatDate(tk.dueAt, locale, tz)}`}{tk.dueAt && tk.dueAt < now && <span className="text-danger"> · {t("common.overdue")}</span>}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={t("clients.c360.documents")} icon={<FileText />}>
              {d.documents.length === 0 ? <EmptyState compact title={t("documents.empty")} /> : (
                <ul className="divide-y divide-line">
                  {d.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                      <Link href={`/app/documents/${doc.id}`} className="min-w-0 flex-1 truncate text-ink hover:underline">{doc.title}</Link>
                      <Badge tone={DOC_STATUS_TONE[doc.status]}>{t(`enums.documentStatus.${doc.status}`)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <CommunicationsView clientId={id} canLog={ctx.can("communications.manage")} items={d.communications.map((x) => ({ id: x.id, channel: x.channel, direction: x.direction, subject: x.subject, body: x.body, occurredAt: x.occurredAt.toISOString(), user: null }))} />
        </div>

        <div className="flex flex-col gap-5 xl:col-span-4">
          <Panel title={t("common.description")} icon={<Contact />}>
            <dl className="grid grid-cols-2 gap-4 p-4">
              <Meta label={t("clients.fields.preferredLanguage")}>{c.preferredLanguage === "ar" ? t("clients.langAr") : t("clients.langEn")}</Meta>
              <Meta label={t("clients.fields.source")}>{c.source ? t(`clients.sources.${c.source}`) : "—"}</Meta>
              {c.type === "COMPANY" ? <Meta label={t("clients.fields.tradeLicenseNo")}><span className="ltr-nums">{c.tradeLicenseNo ?? "—"}</span></Meta> : <Meta label={t("clients.fields.nationality")}>{c.nationality ?? "—"}</Meta>}
              <Meta label={t("common.createdAt")}>{formatDate(c.createdAt, locale, tz)}</Meta>
              {c.address && <Meta label={t("clients.fields.address")} className="col-span-2">{c.address}</Meta>}
            </dl>
            {c.hasSensitive && (
              <div className="border-t border-line p-4">
                <SensitiveReveal id={id} canView={d.canViewSensitive} />
              </div>
            )}
            {c.notes && <p className="whitespace-pre-line border-t border-line p-4 text-[13px] text-ink-muted">{c.notes}</p>}
          </Panel>

          <Panel title={t("clients.c360.appointments")} icon={<CalendarDays />}>
            {d.appointments.length === 0 ? <EmptyState compact title="—" /> : (
              <ul className="divide-y divide-line">
                {d.appointments.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-[13px]">
                    <div className="text-ink">{a.title}</div>
                    <div className="text-[12px] text-ink-subtle">{formatDateTime(a.startsAt, locale, tz)} · {t(`enums.appointmentType.${a.type}`)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {d.outstanding != null && (
            <Panel title={t("clients.c360.invoices")} icon={<Wallet />}>
              {d.invoices.length === 0 ? <EmptyState compact title="—" /> : (
                <ul className="divide-y divide-line">
                  {d.invoices.map((i) => (
                    <li key={i.id}>
                      <Link href={`/app/finance/invoices/${i.id}`} className="flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-surface-muted/60">
                        <span className="ltr-nums flex-1 font-mono text-ink">{i.number}</span>
                        <span className="ltr-nums tabular text-ink-muted">{formatMoney(i.total, locale, ctx.org.currency)}</span>
                        <Badge tone={INVOICE_STATUS_TONE[i.status]}>{t(`enums.invoiceStatus.${i.status}`)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <Panel title={t("clients.c360.contacts")} icon={<Contact />}>
            {c.contacts.length === 0 ? <EmptyState compact title="—" /> : (
              <ul className="divide-y divide-line">
                {c.contacts.map((p) => (
                  <li key={p.id} className="px-4 py-2.5 text-[13px]">
                    <div className="text-ink">{L(p.nameEn, p.nameAr)}</div>
                    <div className="ltr-nums text-[12px] text-ink-subtle">{[p.jobTitle, p.email, p.phone].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("clients.c360.portal")} icon={<Globe />}>
            {c.portalUsers.length === 0 ? <p className="px-4 py-3 text-[13px] text-ink-muted">{t("clients.c360.noPortal")}</p> : (
              <ul className="divide-y divide-line">
                {c.portalUsers.map((u) => (
                  <li key={u.id} className="px-4 py-2.5 text-[13px]"><span className="ltr-nums">{u.email}</span> <span className="text-[12px] text-ink-subtle">· {u.lastLoginAt ? relativeTime(u.lastLoginAt, locale) : "—"}</span></li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("clients.c360.activity")} icon={<Activity />}>
            {d.activity.length === 0 ? <EmptyState compact title={t("dashboard.activityEmpty")} /> : (
              <ul className="divide-y divide-line">
                {d.activity.map((a) => (
                  <li key={a.id} className="px-4 py-2 text-[12.5px]">
                    <span className="font-medium">{a.actor ? L(a.actor.name, a.actor.nameAr) : "—"}</span> <span className="text-ink-muted">{t(`activity.${a.type}`, a.data as Record<string, string>)}</span>
                    <div className="text-[11px] text-ink-subtle"><span className="ltr-nums">{a.matter?.internalNumber}</span> · {relativeTime(a.createdAt, locale)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

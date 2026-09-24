import Link from "next/link";
import { Briefcase, Plus, Lock, Gavel, CalendarClock } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getDensity } from "@/server/prefs";
import { listMatters, matterListQuery, MATTER_VIEWS } from "@/server/services/matters";
import { getReference } from "@/server/services/reference";
import { db } from "@/server/db";
import { Page, PageHeader, EmptyState, Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { StatusText, PriorityText, MATTER_STATUS_TONE } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { CountdownInline } from "@/components/countdown";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CasesToolbar, Pager } from "./toolbar";
import { ALL_COLUMNS } from "./columns";

export const metadata = { title: "Cases" };

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const q = matterListQuery.parse(sp);
  const [data, ref, savedViews, density] = await Promise.all([
    listMatters(ctx, q),
    getReference(ctx.org.id),
    db.savedView.findMany({ where: { userId: ctx.user.id, module: "cases" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, filters: true } }),
    getDensity(),
  ]);
  const prefCols = (ctx.user.preferences as { caseColumns?: string[] }).caseColumns;
  const cols = new Set(prefCols?.length ? prefCols : ALL_COLUMNS);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;
  const hasFilters = !!(q.q || q.status || q.kind || q.priority || q.lawyer || q.court || q.client);
  const compact = density === "compact";

  return (
    <Page width="full" className="max-w-[1600px]">
      <PageHeader
        title={
          <span className="flex items-baseline gap-2">
            {t("cases.title")}
            <span className="text-body font-normal text-ink-subtle tabular">{data.total}</span>
          </span>
        }
        actions={
          ctx.can("matters.create") && (
            <Button asChild variant="primary">
              <Link href="/app/cases/new">
                <Plus /> {t("cases.new")}
              </Link>
            </Button>
          )
        }
      />

      <CasesToolbar
        views={[...MATTER_VIEWS]}
        query={q}
        columns={[...cols]}
        density={density}
        savedViews={savedViews.map((v) => ({ id: v.id, name: v.name, filters: v.filters as Record<string, string> }))}
        options={{
          lawyers: ref.staff.map((s) => ({ value: s.id, label: L(s.name, s.nameAr) })),
          courts: ref.courts.map((c) => ({ value: c.id, label: L(c.name, c.nameAr) })),
        }}
      />

      <div className="-mx-4 mt-3 border-y border-line sm:mx-0 sm:rounded-lg sm:border">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<Briefcase />}
            title={hasFilters || q.view !== "all" ? t("cases.empty") : t("cases.emptyFirst")}
            body={hasFilters || q.view !== "all" ? t("cases.emptyBody") : t("cases.emptyFirstBody")}
            action={
              ctx.can("matters.create") && !hasFilters ? (
                <Button asChild variant="primary" size="sm">
                  <Link href="/app/cases/new">
                    <Plus /> {t("cases.new")}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden md:block">
              <Table density={density}>
                <THead>
                  <tr>
                    <TH>{t("cases.col.case")}</TH>
                    {cols.has("client") && <TH>{t("cases.col.client")}</TH>}
                    {cols.has("type") && <TH className="hidden xl:table-cell">{t("cases.col.type")}</TH>}
                    {cols.has("court") && <TH className="hidden 2xl:table-cell">{t("cases.col.court")}</TH>}
                    {cols.has("lawyer") && <TH className="hidden xl:table-cell">{t("cases.col.lawyer")}</TH>}
                    {cols.has("stage") && <TH className="hidden xl:table-cell">{t("cases.col.stage")}</TH>}
                    {cols.has("nextEvent") && <TH>{t("cases.col.nextEvent")}</TH>}
                    {cols.has("priority") && <TH className="hidden xl:table-cell">{t("cases.col.priority")}</TH>}
                    {cols.has("status") && <TH>{t("cases.col.status")}</TH>}
                  </tr>
                </THead>
                <tbody>
                  {data.rows.map((m) => (
                    <TR key={m.id}>
                      <TD className={cn("min-w-[240px] max-w-[300px] xl:max-w-[440px]", !compact && "py-1.5")}>
                        <Link href={`/app/cases/${m.id}`} className="group/link block min-w-0">
                          {compact ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="record-id shrink-0 text-ink-subtle">{m.internalNumber}</span>
                              {m.confidentiality !== "STANDARD" && <Lock className="size-3 shrink-0 text-warning" aria-label={t("cases.restricted")} />}
                              <span className="bidi-plain truncate font-medium text-ink group-hover/link:underline">{L(m.title, m.titleAr)}</span>
                            </span>
                          ) : (
                            <>
                              <span className="flex min-w-0 items-center gap-1.5">
                                {m.confidentiality !== "STANDARD" && <Lock className="size-3 shrink-0 text-warning" aria-label={t("cases.restricted")} />}
                                <span className="bidi-plain truncate font-medium text-ink group-hover/link:underline">{L(m.title, m.titleAr)}</span>
                              </span>
                              <span className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-ink-subtle">
                                <span className="record-id">{m.internalNumber}</span>
                                {m.officialCaseNumber && <span className="record-id text-ink-subtle/80">· {m.officialCaseNumber}</span>}
                              </span>
                            </>
                          )}
                        </Link>
                      </TD>
                      {cols.has("client") && (
                        <TD className="max-w-[160px] xl:max-w-[200px]">
                          <Link href={`/app/clients/${m.client.id}`} className="block truncate text-ink-muted hover:text-ink hover:underline">
                            {L(m.client.nameEn, m.client.nameAr)}
                          </Link>
                        </TD>
                      )}
                      {cols.has("type") && <TD className="hidden max-w-[160px] truncate text-ink-muted xl:table-cell">{m.caseType ? L(m.caseType.name, m.caseType.nameAr) : t(`enums.matterKind.${m.kind}`)}</TD>}
                      {cols.has("court") && <TD className="hidden max-w-[200px] truncate text-ink-muted 2xl:table-cell">{m.court ? L(m.court.name, m.court.nameAr) : "—"}</TD>}
                      {cols.has("lawyer") && (
                        <TD className="hidden xl:table-cell">
                          {m.leadLawyer ? (
                            <span className="inline-flex max-w-[150px] items-center gap-2 text-ink-muted">
                              <Avatar name={m.leadLawyer.name} src={m.leadLawyer.photoUrl} size={20} />
                              <span className="truncate">{L(m.leadLawyer.name, m.leadLawyer.nameAr)}</span>
                            </span>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </TD>
                      )}
                      {cols.has("stage") && <TD className="hidden text-ink-muted xl:table-cell">{m.stage ? L(m.stage.name, m.stage.nameAr) : <span className="text-ink-subtle">—</span>}</TD>}
                      {cols.has("nextEvent") && (
                        <TD className="whitespace-nowrap">
                          {m.next ? (
                            <span className="inline-flex items-center gap-2">
                              {m.next.kind === "HEARING" ? <Gavel className="size-3.5 text-ev-hearing" aria-label={t("enums.eventType.HEARING")} /> : <CalendarClock className="size-3.5 text-ink-subtle" aria-hidden />}
                              <span className="tabular text-ink-muted">{formatDate(m.next.at, locale, tz, { day: "numeric", month: "short", year: undefined })}</span>
                              <CountdownInline target={m.next.at} />
                            </span>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </TD>
                      )}
                      {cols.has("priority") && (
                        <TD className="hidden xl:table-cell">
                          <PriorityText priority={m.priority} label={t(`enums.priority.${m.priority}`)} />
                        </TD>
                      )}
                      {cols.has("status") && (
                        <TD>
                          <StatusText tone={MATTER_STATUS_TONE[m.status]}>{t(`enums.matterStatus.${m.status}`)}</StatusText>
                        </TD>
                      )}
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            {/* Mobile: compact records */}
            <ul className="divide-y divide-line md:hidden">
              {data.rows.map((m) => (
                <li key={m.id}>
                  <Link href={`/app/cases/${m.id}`} className="block px-4 py-3 active:bg-surface-muted">
                    <div className="flex items-start justify-between gap-3">
                      <span className="bidi-plain min-w-0 text-ui font-medium leading-snug text-ink">{L(m.title, m.titleAr)}</span>
                      <StatusText tone={MATTER_STATUS_TONE[m.status]} className="shrink-0 text-meta">{t(`enums.matterStatus.${m.status}`)}</StatusText>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-meta text-ink-muted">
                      <span className="record-id text-ink-subtle">{m.internalNumber}</span>
                      <span className="truncate">· {L(m.client.nameEn, m.client.nameAr)}</span>
                    </div>
                    {m.next && (
                      <div className="mt-1 flex items-center gap-1.5 text-meta text-ink-muted">
                        {m.next.kind === "HEARING" ? <Gavel className="size-3 text-ev-hearing" aria-hidden /> : <CalendarClock className="size-3" aria-hidden />}
                        {formatDate(m.next.at, locale, tz, { day: "numeric", month: "short", year: undefined })}
                        <CountdownInline target={m.next.at} className="text-meta" />
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <Pager total={data.total} page={q.page} pageSize={data.pageSize} />
          </>
        )}
      </div>
    </Page>
  );
}

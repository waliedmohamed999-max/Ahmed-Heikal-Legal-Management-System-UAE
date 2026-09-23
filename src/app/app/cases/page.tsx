import Link from "next/link";
import { Briefcase, Plus, Lock, Gavel, CalendarClock } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { listMatters, matterListQuery, MATTER_VIEWS } from "@/server/services/matters";
import { getReference } from "@/server/services/reference";
import { db } from "@/server/db";
import { PageHeader, EmptyState, Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge, PRIORITY_TONE, MATTER_STATUS_TONE } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { CountdownInline } from "@/components/countdown";
import { formatDate } from "@/lib/time";
import { CasesToolbar, Pager } from "./toolbar";
import { ALL_COLUMNS } from "./columns";

export const metadata = { title: "Cases" };

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const q = matterListQuery.parse(sp);
  const [data, ref, savedViews] = await Promise.all([
    listMatters(ctx, q),
    getReference(ctx.org.id),
    db.savedView.findMany({ where: { userId: ctx.user.id, module: "cases" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, filters: true } }),
  ]);
  const prefCols = (ctx.user.preferences as { caseColumns?: string[] }).caseColumns;
  const cols = new Set(prefCols?.length ? prefCols : ALL_COLUMNS);
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  const tz = ctx.org.timezone;
  const hasFilters = !!(q.q || q.status || q.kind || q.priority || q.lawyer || q.court || q.client);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={t("cases.title")}
        subtitle={t("cases.subtitle")}
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
        savedViews={savedViews.map((v) => ({ id: v.id, name: v.name, filters: v.filters as Record<string, string> }))}
        options={{
          lawyers: ref.staff.map((s) => ({ value: s.id, label: L(s.name, s.nameAr) })),
          courts: ref.courts.map((c) => ({ value: c.id, label: L(c.name, c.nameAr) })),
        }}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
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
              <Table>
                <THead>
                  <tr>
                    <TH>{t("cases.col.case")}</TH>
                    {cols.has("client") && <TH>{t("cases.col.client")}</TH>}
                    {cols.has("type") && <TH>{t("cases.col.type")}</TH>}
                    {cols.has("court") && <TH className="hidden 2xl:table-cell">{t("cases.col.court")}</TH>}
                    {cols.has("lawyer") && <TH>{t("cases.col.lawyer")}</TH>}
                    {cols.has("stage") && <TH className="hidden lg:table-cell">{t("cases.col.stage")}</TH>}
                    {cols.has("nextEvent") && <TH>{t("cases.col.nextEvent")}</TH>}
                    {cols.has("priority") && <TH>{t("cases.col.priority")}</TH>}
                    {cols.has("status") && <TH>{t("cases.col.status")}</TH>}
                  </tr>
                </THead>
                <tbody>
                  {data.rows.map((m) => (
                    <TR key={m.id}>
                      <TD className="max-w-[340px]">
                        <Link href={`/app/cases/${m.id}`} className="block min-w-0">
                          <div className="flex items-center gap-1.5">
                            {m.confidentiality !== "STANDARD" && <Lock className="size-3.5 shrink-0 text-warning" aria-label={t("cases.restricted")} />}
                            <span className="truncate font-medium text-ink hover:underline">{L(m.title, m.titleAr)}</span>
                          </div>
                          <div className="ltr-nums mt-0.5 font-mono text-[11.5px] text-ink-subtle">
                            {m.internalNumber}
                            {m.officialCaseNumber && <span className="text-ink-subtle/80"> · {m.officialCaseNumber}</span>}
                          </div>
                        </Link>
                      </TD>
                      {cols.has("client") && (
                        <TD className="max-w-[180px]">
                          <Link href={`/app/clients/${m.client.id}`} className="block truncate text-ink-muted hover:text-ink hover:underline">
                            {L(m.client.nameEn, m.client.nameAr)}
                          </Link>
                        </TD>
                      )}
                      {cols.has("type") && (
                        <TD className="text-ink-muted">
                          <div className="truncate">{m.caseType ? L(m.caseType.name, m.caseType.nameAr) : t(`enums.matterKind.${m.kind}`)}</div>
                        </TD>
                      )}
                      {cols.has("court") && <TD className="hidden max-w-[200px] truncate text-ink-muted 2xl:table-cell">{m.court ? L(m.court.name, m.court.nameAr) : "—"}</TD>}
                      {cols.has("lawyer") && (
                        <TD>
                          {m.leadLawyer ? (
                            <span className="inline-flex items-center gap-2 text-ink-muted">
                              <Avatar name={m.leadLawyer.name} src={m.leadLawyer.photoUrl} size={22} />
                              <span className="truncate">{L(m.leadLawyer.name, m.leadLawyer.nameAr).split(" ")[0]}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </TD>
                      )}
                      {cols.has("stage") && <TD className="hidden text-ink-muted lg:table-cell">{m.stage ? L(m.stage.name, m.stage.nameAr) : "—"}</TD>}
                      {cols.has("nextEvent") && (
                        <TD>
                          {m.next ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                                {m.next.kind === "HEARING" ? <Gavel className="size-3.5 text-ev-hearing" /> : <CalendarClock className="size-3.5 text-high" />}
                                {formatDate(m.next.at, locale, tz, { day: "numeric", month: "short", year: undefined })}
                              </span>
                              <CountdownInline target={m.next.at} />
                            </div>
                          ) : (
                            <span className="text-ink-subtle">{t("cases.noNextEvent")}</span>
                          )}
                        </TD>
                      )}
                      {cols.has("priority") && (
                        <TD>
                          <Badge tone={PRIORITY_TONE[m.priority]}>{t(`enums.priority.${m.priority}`)}</Badge>
                        </TD>
                      )}
                      {cols.has("status") && (
                        <TD>
                          <Badge tone={MATTER_STATUS_TONE[m.status]}>{t(`enums.matterStatus.${m.status}`)}</Badge>
                        </TD>
                      )}
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            {/* Mobile list */}
            <ul className="divide-y divide-line md:hidden">
              {data.rows.map((m) => (
                <li key={m.id}>
                  <Link href={`/app/cases/${m.id}`} className="block px-4 py-3 active:bg-surface-muted">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[14px] font-medium text-ink">{L(m.title, m.titleAr)}</span>
                      <Badge tone={PRIORITY_TONE[m.priority]} className="shrink-0">{t(`enums.priority.${m.priority}`)}</Badge>
                    </div>
                    <div className="ltr-nums mt-0.5 font-mono text-[11.5px] text-ink-subtle">{m.internalNumber}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px] text-ink-muted">
                      <span className="truncate">{L(m.client.nameEn, m.client.nameAr)}</span>
                      {m.next && <CountdownInline target={m.next.at} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager total={data.total} page={q.page} pageSize={data.pageSize} />
          </>
        )}
      </div>
    </div>
  );
}

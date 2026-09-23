import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { auditWhere } from "@/server/services/audit-query";
import { getT } from "@/i18n/server";
import { db } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/ui/layout";
import { ListSearch } from "@/components/list-search";
import { Pager } from "../cases/toolbar";
import { formatDateTime } from "@/lib/time";
import { AuditTools, AuditRow } from "./client";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireStaff();
  if (!ctx.can("audit.view")) notFound();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = auditWhere(ctx.org.id, sp);
  const [total, rows, users] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { seq: "desc" }, skip: (page - 1) * 50, take: 50, include: { actor: { select: { name: true, nameAr: true } }, matter: { select: { internalNumber: true } } } }),
    db.user.findMany({ where: { organizationId: ctx.org.id }, select: { id: true, name: true, nameAr: true }, orderBy: { name: "asc" } }),
  ]);
  const L = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const ACTIONS = ["auth", "matter", "document", "permission", "access", "client", "deadline", "hearing", "invoice", "payment", "settings", "ai", "privacy"];
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} actions={<AuditTools canExport={ctx.can("audit.export")} query={new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString()} />} />
      <ListSearch className="mt-6" placeholder={t("common.search")} filters={[
        { key: "user", label: t("audit.user"), options: users.map((u) => ({ value: u.id, label: L(u.name, u.nameAr) })) },
        { key: "action", label: t("audit.action"), options: ACTIONS.map((a) => ({ value: a, label: a })) },
      ]} />
      <form className="mt-2 flex flex-wrap items-end gap-2 text-[12.5px]" action="/app/audit">
        {Object.entries(sp).filter(([k, v]) => v && !["from", "to", "page"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex items-center gap-1.5">{t("audit.from")} <input type="date" name="from" defaultValue={sp.from} className="h-8 rounded-md border border-line-strong bg-surface px-2" /></label>
        <label className="flex items-center gap-1.5">{t("audit.to")} <input type="date" name="to" defaultValue={sp.to} className="h-8 rounded-md border border-line-strong bg-surface px-2" /></label>
        <button type="submit" className="h-8 rounded-md border border-line-strong bg-surface px-3 font-medium">{t("common.apply")}</button>
      </form>
      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        {rows.length === 0 ? <EmptyState title={t("audit.empty")} /> : (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-muted/80"><tr className="text-start text-[11.5px] text-ink-subtle">{[t("audit.time"), t("audit.user"), t("audit.action"), t("audit.record"), t("audit.ip"), t("audit.changes")].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <AuditRow key={r.id} r={{
                      id: r.id, time: formatDateTime(r.createdAt, locale, ctx.org.timezone), actor: r.actor ? L(r.actor.name, r.actor.nameAr) : "system", action: r.action,
                      record: [r.entityType, r.matter?.internalNumber].filter(Boolean).join(" · "), ip: r.ip, ua: r.userAgent, before: r.before, after: r.after, metadata: r.metadata, hash: r.hash,
                    }} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={total} page={page} pageSize={50} />
          </>
        )}
      </div>
    </div>
  );
}

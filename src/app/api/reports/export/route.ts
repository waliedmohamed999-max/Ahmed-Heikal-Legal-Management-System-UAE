import { NextResponse } from "next/server";
import { staffRoute } from "@/server/api";
import { audit } from "@/server/audit";
import { buildReport, REPORT_PERIODS } from "@/server/services/reports";
import { toCsv } from "@/lib/csv";

export const GET = staffRoute(async (req, ctx) => {
  const raw = new URL(req.url).searchParams.get("period") ?? "30";
  const period = (REPORT_PERIODS as readonly string[]).includes(raw) ? Number(raw) : 30;
  const r = await buildReport(ctx, period);
  const rows: unknown[][] = [
    ...Object.entries(r.kpis).map(([k, v]) => ["kpi", k, v, ""]),
    ...r.byType.map((x) => ["cases_by_type", x.label, x.count, ""]),
    ...r.byCourt.map((x) => ["cases_by_court", x.label, x.count, ""]),
    ...r.byLawyer.map((x) => ["cases_by_lawyer", x.label, x.count, ""]),
    ...r.documents.map((x) => ["documents_by_status", x.label, x.count, ""]),
    ...(r.clients ? [["clients", "new_clients", r.clients.newClients, ""], ...r.clients.sources.map((x) => ["client_sources", x.label, x.count, ""])] : []),
    ...(r.finance
      ? [
          ["finance", "payments_received", "", r.finance.revenue],
          ["finance", "refunds", "", r.finance.refunds],
          ["finance", "outstanding", r.finance.outstandingCount, r.finance.outstanding],
          ["finance", "expenses", "", r.finance.expenses],
          ["finance", "time_minutes", r.finance.minutes, ""],
        ]
      : []),
    ...(r.workload ?? []).flatMap((u) => [
      ["workload_active_cases", u.name, u.activeMatters, ""],
      ["workload_open_tasks", u.name, u.openTasks, ""],
      ["workload_urgent_tasks", u.name, u.urgentTasks, ""],
      ["workload_hearings_7d", u.name, u.hearings7d, ""],
    ]),
  ];
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "report.exported", metadata: { periodDays: period, rows: rows.length } });
  return new NextResponse(toCsv(["section", "item", "count", `amount_${ctx.org.currency}`], rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="report-${period}d-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
});

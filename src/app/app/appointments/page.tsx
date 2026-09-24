import { CalendarDays, Hourglass } from "lucide-react";
import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { getAgenda } from "@/server/services/agenda";
import { db } from "@/server/db";
import { PageHeader, Panel, EmptyState } from "@/components/ui/layout";
import { EventRow } from "@/components/events";
import { QuickButton } from "@/components/quick-button";
import { formatDateTime } from "@/lib/time";
import { ConfirmAppointment } from "./confirm";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const ctx = await requireStaff();
  const { t, locale } = await getT();
  const now = new Date();
  const [upcoming, past, requested] = await Promise.all([
    getAgenda(ctx, { from: now, to: new Date(now.getTime() + 60 * 86400_000), kinds: ["APPOINTMENT"], mine: !ctx.can("calendar.viewTeam") }),
    getAgenda(ctx, { from: new Date(now.getTime() - 30 * 86400_000), to: now, kinds: ["APPOINTMENT"], mine: !ctx.can("calendar.viewTeam"), includeDone: true }),
    ctx.can("appointments.manage") ? db.appointment.findMany({ where: { organizationId: ctx.org.id, status: "REQUESTED", deletedAt: null }, orderBy: { startsAt: "asc" }, include: { lead: { select: { name: true, phone: true, email: true } } } }) : [],
  ]);
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
      <PageHeader title={t("appointmentsPage.title")} subtitle={t("appointmentsPage.subtitle")} actions={ctx.can("appointments.manage") && <QuickButton type="appointment" label={t("appointments.new")} variant="primary" size="md" />} />
      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <Panel title={t("appointmentsPage.upcoming")} icon={<CalendarDays />}>
            {upcoming.filter((a) => a.status !== "REQUESTED").length ? <ul className="divide-y divide-line">{upcoming.filter((a) => a.status !== "REQUESTED").map((e) => <li key={e.id}><EventRow e={e} showDate /></li>)}</ul> : <EmptyState compact title={t("appointmentsPage.empty")} />}
          </Panel>
          <Panel title={t("appointmentsPage.past")}>
            {past.length ? <ul className="divide-y divide-line">{past.reverse().map((e) => <li key={e.id}><EventRow e={e} showDate showCountdown={false} /></li>)}</ul> : <EmptyState compact title={t("appointmentsPage.empty")} />}
          </Panel>
        </div>
        <Panel className="xl:col-span-4" title={t("appointmentsPage.requested")} icon={<Hourglass />}>
          {requested.length === 0 ? <EmptyState compact title={t("appointmentsPage.empty")} /> : (
            <ul className="divide-y divide-line">
              {requested.map((a) => (
                <li key={a.id} className="space-y-1.5 px-4 py-3 text-body">
                  <p className="font-medium text-ink">{a.title}</p>
                  <p className="text-meta text-ink-muted">{formatDateTime(a.startsAt, locale, ctx.org.timezone)} · {t(`enums.appointmentType.${a.type}`)}</p>
                  {a.lead && <p className="ltr-nums text-meta text-ink-subtle">{a.lead.phone} · {a.lead.email}</p>}
                  <ConfirmAppointment id={a.id} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Plus, Pencil, ClipboardList, FileCheck2, MapPin, Video, User, CheckCircle2, AlertCircle, CalendarClock, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge, HEARING_STATUS_TONE } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Dialog } from "@/components/ui/overlay";
import { CountdownInline, useNow } from "@/components/countdown";
import { useAction } from "@/components/forms";
import { HearingDialog } from "@/components/quick/forms";
import { formatDate, formatDateTime, formatTime, toZonedLocalInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { acknowledgeHearingAction } from "@/app/app/event-actions";
import { HearingReportDialog } from "@/components/hearing-report";

export type HearingRow = {
  id: string; startsAt: string; endsAt: string | null; status: string; sessionType: string | null; courtRoom: string | null; isRemote: boolean; remoteUrl: string | null;
  judge: string | null; clientAttendance: string; requiredDocuments: string | null; preparationNotes: string | null; outcome: string | null; decisions: string | null;
  requiredActions: string | null; reportedAt: string | null; acknowledgedAt: string | null; previousHearingId: string | null; court: { id: string; name: string } | null;
  lawyer: { id: string; name: string } | null; deadlines: { id: string; title: string; dueAt: string }[];
};

export function HearingsView({ matterId, matterLabel, meId, focus, caps, hearings }: { matterId: string; matterLabel: string; meId: string; focus: string | null; caps: string[]; hearings: HearingRow[] }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const now = useNow();
  const [edit, setEdit] = useState<HearingRow | "new" | null>(null);
  const [report, setReport] = useState<HearingRow | null>(null);
  const { run, pending } = useAction();
  const can = (c: string) => caps.includes(c);
  const upcoming = hearings.filter((h) => new Date(h.startsAt).getTime() >= now - 3 * 3600_000 && !["HELD", "CANCELLED", "ADJOURNED"].includes(h.status)).reverse();
  const past = hearings.filter((h) => !upcoming.includes(h));
  const next = upcoming[0];
  const reportDue = hearings.filter((h) => new Date(h.startsAt).getTime() < now && !h.reportedAt && h.status !== "CANCELLED");

  const Card = ({ h, big }: { h: HearingRow; big?: boolean }) => (
    <li id={`h-${h.id}`} className={cn("rounded-lg border bg-surface p-4 shadow-xs", focus === h.id ? "border-accent ring-2 ring-accent/15" : "border-line")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={HEARING_STATUS_TONE[h.status]}>{t(`enums.hearingStatus.${h.status}`)}</Badge>
            {h.reportedAt && <Badge tone="success"><FileCheck2 /> {t("hearings.reported")}</Badge>}
            {!h.reportedAt && new Date(h.startsAt).getTime() < now && h.status !== "CANCELLED" && <Badge tone="warning"><AlertCircle /> {t("hearings.reportDue")}</Badge>}
          </div>
          <p className="mt-1.5 text-heading font-semibold text-ink">{h.sessionType || t("enums.eventType.HEARING")}</p>
          <p className="mt-0.5 text-body text-ink-muted">{formatDate(h.startsAt, locale, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {formatTime(h.startsAt, locale, tz)}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-muted">
            {h.court && <span className="inline-flex items-center gap-1"><Gavel className="size-3.5" /> {h.court.name}</span>}
            {h.isRemote ? (
              <span className="inline-flex items-center gap-1"><Video className="size-3.5" /> {h.remoteUrl ? <a href={h.remoteUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">{t("hearingWidget.remote")}</a> : t("hearingWidget.remote")}</span>
            ) : h.courtRoom && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {h.courtRoom}</span>}
            {h.lawyer && <span className="inline-flex items-center gap-1"><User className="size-3.5" /> {h.lawyer.name}</span>}
            {h.judge && <span>{t("hearings.judge")}: {h.judge}</span>}
            <span>{t("hearings.clientAttendance")}: {t(`enums.attendance.${h.clientAttendance}`)}</span>
          </div>
        </div>
        {big && <CountdownInline target={h.startsAt} className="text-[17px] font-semibold" />}
      </div>

      {(h.requiredDocuments || h.preparationNotes) && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          {h.requiredDocuments && <div><p className="text-meta font-medium text-ink-subtle">{t("hearings.requiredDocuments")}</p><p className="mt-0.5 whitespace-pre-line text-body text-ink">{h.requiredDocuments}</p></div>}
          {h.preparationNotes && <div><p className="text-meta font-medium text-ink-subtle">{t("hearings.preparationNotes")}</p><p className="mt-0.5 whitespace-pre-line text-body text-ink">{h.preparationNotes}</p></div>}
        </div>
      )}
      {h.reportedAt && (
        <div className="mt-3 grid gap-3 rounded-md bg-surface-muted/70 p-3 sm:grid-cols-3">
          <div><p className="text-meta font-medium text-ink-subtle">{t("hearings.outcome")}</p><p className="mt-0.5 whitespace-pre-line text-body text-ink">{h.outcome}</p></div>
          <div><p className="text-meta font-medium text-ink-subtle">{t("hearings.decisions")}</p><p className="mt-0.5 whitespace-pre-line text-body text-ink">{h.decisions || "—"}</p></div>
          <div><p className="text-meta font-medium text-ink-subtle">{t("hearings.requiredActions")}</p><p className="mt-0.5 whitespace-pre-line text-body text-ink">{h.requiredActions || "—"}</p></div>
          {h.deadlines.length > 0 && (
            <div className="sm:col-span-3">
              {h.deadlines.map((d) => <p key={d.id} className="inline-flex items-center gap-1.5 text-meta text-high"><CalendarClock className="size-3.5" /> {d.title} — {formatDateTime(d.dueAt, locale, tz)}</p>)}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {!h.reportedAt && new Date(h.startsAt).getTime() > now && <Button asChild size="xs" variant="secondary"><Link href={`/app/hearings/${h.id}/prepare`}><ClipboardList /> {t("hearings.prepare")}</Link></Button>}
        {can("hearings.report") && !h.reportedAt && h.status !== "CANCELLED" && new Date(h.startsAt).getTime() < now + 6 * 3600_000 && (
          <Button size="xs" variant="primary" onClick={() => setReport(h)}><FileCheck2 /> {t("hearings.reportCta")}</Button>
        )}
        {can("hearings.manage") && !h.reportedAt && <Button size="xs" variant="ghost" onClick={() => setEdit(h)}><Pencil /> {t("common.edit")}</Button>}
        {h.lawyer?.id === meId && !h.acknowledgedAt && new Date(h.startsAt).getTime() > now && (
          <Button size="xs" variant="ghost" loading={pending} onClick={() => run(() => acknowledgeHearingAction({ id: h.id }), { onSuccess: () => router.refresh() })}><CheckCircle2 /> {t("hearings.acknowledge")}</Button>
        )}
        {h.acknowledgedAt ? <span className="ms-auto text-meta text-success">{t("hearings.acknowledged")}</span> : new Date(h.startsAt).getTime() > now && <span className="ms-auto text-meta text-ink-subtle">{t("hearings.notAcknowledged")}</span>}
      </div>
    </li>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-8">
        {reportDue.length > 0 && can("hearings.report") && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-body text-warning">
            <AlertCircle className="size-4 shrink-0" /> <span className="flex-1">{t("hearings.reportIntro")}</span>
            <Button size="xs" variant="primary" onClick={() => setReport(reportDue[0])}>{t("hearings.reportCta")}</Button>
          </div>
        )}
        <Panel title={t("hearings.upcoming")} icon={<Gavel />} actions={can("hearings.manage") && <Button size="sm" variant="secondary" onClick={() => setEdit("new")}><Plus /> {t("hearings.new")}</Button>}>
          {upcoming.length === 0 ? (
            <EmptyState icon={<Gavel />} title={t("hearings.empty")} body={t("hearings.emptyBody")} action={can("hearings.manage") && <Button size="sm" variant="primary" onClick={() => setEdit("new")}><Plus /> {t("hearings.new")}</Button>} />
          ) : (
            <ul className="space-y-3 p-4">{upcoming.map((h) => <Card key={h.id} h={h} big={h === next} />)}</ul>
          )}
        </Panel>
      </div>
      <div className="xl:col-span-4">
        <Panel title={t("hearings.past")}>
          {past.length === 0 ? <EmptyState compact title="—" /> : (
            <ol className="divide-y divide-line">
              {past.map((h) => (
                <li key={h.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body font-medium text-ink">{h.sessionType || t("enums.eventType.HEARING")}</span>
                    <Badge tone={HEARING_STATUS_TONE[h.status]}>{t(`enums.hearingStatus.${h.status}`)}</Badge>
                  </div>
                  <p className="text-meta text-ink-subtle">{formatDateTime(h.startsAt, locale, tz)}</p>
                  {h.decisions && <p className="mt-1 line-clamp-3 text-meta text-ink-muted">{h.decisions}</p>}
                  {!h.reportedAt && h.status !== "CANCELLED" && can("hearings.report") && (
                    <Button size="xs" variant="link" className="mt-1" onClick={() => setReport(h)}>{t("hearings.reportCta")} <ArrowUpRight className="size-3" /></Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <HearingDialog
            matterId={matterId}
            labels={edit === "new" ? { matter: matterLabel } : { matter: matterLabel, court: edit.court?.name, user: edit.lawyer?.name }}
            initial={edit === "new" ? undefined : {
              id: edit.id, matterId, courtId: edit.court?.id ?? "", courtRoom: edit.courtRoom ?? "", isRemote: edit.isRemote, remoteUrl: edit.remoteUrl ?? "",
              startsAt: toZonedLocalInput(edit.startsAt, tz), endsAt: toZonedLocalInput(edit.endsAt, tz), judge: edit.judge ?? "", sessionType: edit.sessionType ?? "",
              attendingLawyerId: edit.lawyer?.id ?? "", clientAttendance: edit.clientAttendance as never, requiredDocuments: edit.requiredDocuments ?? "", preparationNotes: edit.preparationNotes ?? "", status: edit.status as never,
            }}
            onDone={() => setEdit(null)}
          />
        )}
      </Dialog>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        {report && <HearingReportDialog hearing={{ id: report.id, title: report.sessionType ?? "", startsAt: report.startsAt }} onDone={() => { setReport(null); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

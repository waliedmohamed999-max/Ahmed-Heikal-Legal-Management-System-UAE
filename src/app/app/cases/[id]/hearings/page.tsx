import { requireStaff } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { loadWorkspace, type Workspace } from "@/server/services/workspace";
import { db } from "@/server/db";
import { HearingsView } from "./view";

export default async function CaseHearingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ h?: string }> }) {
  const ctx = await requireStaff();
  const { id } = await params;
  const { h } = await searchParams;
  const { locale } = await getT();
  const ws = (await loadWorkspace(ctx, id)) as Workspace;
  const rows = await db.hearing.findMany({
    where: { matterId: id, deletedAt: null },
    orderBy: { startsAt: "desc" },
    include: { court: { select: { id: true, name: true, nameAr: true } }, attendingLawyer: { select: { id: true, name: true, nameAr: true } }, deadlines: { select: { id: true, title: true, dueAt: true } } },
  });
  const L = (en: string, ar: string | null | undefined) => (locale === "ar" ? ar || en : en);
  return (
    <HearingsView
      matterId={id}
      matterLabel={`${ws.matter.internalNumber} · ${L(ws.matter.title, ws.matter.titleAr)}`}
      meId={ctx.user.id}
      focus={h ?? null}
      caps={ws.caps}
      hearings={rows.map((x) => ({
        id: x.id, startsAt: x.startsAt.toISOString(), endsAt: x.endsAt?.toISOString() ?? null, status: x.status, sessionType: x.sessionType, courtRoom: x.courtRoom,
        isRemote: x.isRemote, remoteUrl: x.remoteUrl, judge: x.judge, clientAttendance: x.clientAttendance, requiredDocuments: x.requiredDocuments, preparationNotes: x.preparationNotes,
        outcome: x.outcome, decisions: x.decisions, requiredActions: x.requiredActions, reportedAt: x.reportedAt?.toISOString() ?? null, acknowledgedAt: x.acknowledgedAt?.toISOString() ?? null,
        previousHearingId: x.previousHearingId, court: x.court ? { id: x.court.id, name: L(x.court.name, x.court.nameAr) } : null,
        lawyer: x.attendingLawyer ? { id: x.attendingLawyer.id, name: L(x.attendingLawyer.name, x.attendingLawyer.nameAr) } : null,
        deadlines: x.deadlines.map((d) => ({ id: d.id, title: d.title, dueAt: d.dueAt.toISOString() })),
      }))}
    />
  );
}

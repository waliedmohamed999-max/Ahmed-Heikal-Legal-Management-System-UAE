"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, Clock, ShieldCheck, Check, X, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Panel } from "@/components/ui/layout";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { formatDate, relativeTime } from "@/lib/time";
import { MEMBER_ROLE_CAPS, type MatterAction } from "@/lib/permissions";
import { upsertMemberAction, removeMemberAction, decideAccessAction } from "../../actions";

type Member = { userId: string; name: string; photoUrl: string | null; position: string; role: string; overrides: string[]; expiresAt: string | null };
const ROLES = ["LEAD", "ASSIGNED", "ASSISTANT", "OBSERVER", "DOCUMENTS_ONLY"] as const;
/** Capabilities worth toggling per member (the rest follow the member role). */
const TOGGLES: MatterAction[] = ["matters.edit", "documents.upload", "documents.download", "documents.approve", "documents.delete", "notes.create", "hearings.manage", "deadlines.manage", "tasks.manage", "finance.view", "matters.manageMembers"];

export function TeamView({ matterId, canManage, members, staff, requests }: {
  matterId: string; canManage: boolean; members: Member[]; staff: { id: string; name: string; role: string }[];
  requests: { id: string; name: string; reason: string | null; createdAt: string }[];
}) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<Member | "new" | null>(null);

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <Panel
        className="xl:col-span-8"
        title={t("workspace.members")}
        icon={<ShieldCheck />}
        actions={canManage && staff.length > 0 && <Button size="sm" variant="secondary" onClick={() => setEditing("new")}><UserPlus /> {t("intake.addMember")}</Button>}
      >
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={m.name} src={m.photoUrl} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-ink">{m.name}</div>
                <div className="text-[12px] text-ink-subtle">{m.position}</div>
              </div>
              <Badge tone={m.role === "OWNER" || m.role === "LEAD" ? "brand" : "neutral"}>{t(`enums.memberRole.${m.role}`)}</Badge>
              {m.expiresAt ? (
                <Badge tone="warning"><Clock /> {t("workspace.expires")} {formatDate(m.expiresAt, locale, tz)}</Badge>
              ) : (
                <span className="text-[12px] text-ink-subtle">{t("workspace.permanent")}</span>
              )}
              {m.overrides.length > 0 && <Badge tone="info">{m.overrides.length} {t("workspace.overrides")}</Badge>}
              {canManage && m.role !== "OWNER" && (
                <div className="flex gap-1">
                  <Button size="icon-xs" variant="ghost" aria-label={t("common.edit")} onClick={() => setEditing(m)}><SlidersHorizontal /></Button>
                  <Button size="icon-xs" variant="danger-ghost" aria-label={t("workspace.removeMember")} loading={pending}
                    onClick={() => run(() => removeMemberAction({ matterId, userId: m.userId }), { success: t("common.changesSaved"), onSuccess: () => router.refresh() })}>
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="xl:col-span-4" title={t("workspace.accessRequests")} icon={<Clock />}>
        {requests.length === 0 ? (
          <EmptyState compact title={t("approvals.empty")} />
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => <AccessRequestRow key={r.id} r={r} onDone={() => router.refresh()} />)}
          </ul>
        )}
      </Panel>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <MemberDialog matterId={matterId} member={editing === "new" ? null : editing} staff={staff}
            onDone={() => { setEditing(null); router.refresh(); }} />
        )}
      </Dialog>
    </div>
  );
}

function AccessRequestRow({ r, onDone }: { r: { id: string; name: string; reason: string | null; createdAt: string }; onDone: () => void }) {
  const { t, locale } = useI18n();
  const { run, pending } = useAction();
  const [role, setRole] = useState<"OBSERVER" | "ASSIGNED" | "DOCUMENTS_ONLY">("OBSERVER");
  const [until, setUntil] = useState("");
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="text-[13px]"><span className="font-medium text-ink">{r.name}</span> <span className="text-ink-subtle">· {relativeTime(r.createdAt, locale)}</span></div>
      {r.reason && <p className="rounded bg-surface-muted p-2 text-[12.5px] text-ink-muted">{r.reason}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Select value={role} onChange={(e) => setRole(e.target.value as never)} aria-label={t("approvals.grantAs")} className="h-8 text-[13px]">
          <option value="OBSERVER">{t("approvals.viewOnly")}</option>
          <option value="ASSIGNED">{t("approvals.editAccess")}</option>
          <option value="DOCUMENTS_ONLY">{t("approvals.documentsOnly")}</option>
        </Select>
        <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} aria-label={t("approvals.until")} className="h-8 text-[13px]" />
      </div>
      <div className="flex gap-2">
        <Button size="xs" variant="primary" loading={pending} onClick={() => run(() => decideAccessAction({ id: r.id, approve: true, role, expiresAt: until || null }), { success: t("approvals.decided"), onSuccess: onDone })}>
          <Check /> {t("approvals.grant")}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => run(() => decideAccessAction({ id: r.id, approve: false }), { success: t("approvals.decided"), onSuccess: onDone })}>
          <X /> {t("approvals.reject")}
        </Button>
      </div>
    </li>
  );
}

function MemberDialog({ matterId, member, staff, onDone }: { matterId: string; member: Member | null; staff: { id: string; name: string; role: string }[]; onDone: () => void }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [userId, setUserId] = useState(member?.userId ?? staff[0]?.id ?? "");
  const [role, setRole] = useState<(typeof ROLES)[number]>((member?.role as (typeof ROLES)[number]) ?? "ASSIGNED");
  const [until, setUntil] = useState(member?.expiresAt?.slice(0, 10) ?? "");
  const [overrides, setOverrides] = useState<string[]>(member?.overrides ?? []);
  const base = new Set(MEMBER_ROLE_CAPS[role]);
  const effective = (a: MatterAction) => (overrides.includes(`+${a}`) ? true : overrides.includes(`-${a}`) ? false : base.has(a));
  const toggle = (a: MatterAction, on: boolean) => {
    const rest = overrides.filter((o) => o.slice(1) !== a);
    setOverrides(on === base.has(a) ? rest : [...rest, `${on ? "+" : "-"}${a}`]);
  };
  return (
    <DialogContent title={member ? member.name : t("workspace.addMemberTitle")} size="md">
      <div className="grid gap-4">
        {!member && (
          <Field label={t("common.name")}>{(a) => <Select {...a} value={userId} onChange={(e) => setUserId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.role}</option>)}</Select>}</Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("workspace.memberRole")}>{(a) => <Select {...a} value={role} onChange={(e) => { setRole(e.target.value as never); setOverrides([]); }}>{ROLES.map((r) => <option key={r} value={r}>{t(`enums.memberRole.${r}`)}</option>)}</Select>}</Field>
          <Field label={t("workspace.tempAccess")}>{(a) => <Input {...a} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">{t("workspace.overrides")}</p>
          <div className="grid grid-cols-1 gap-1 rounded-md border border-line p-2 sm:grid-cols-2">
            {TOGGLES.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-surface-muted">
                <input type="checkbox" checked={effective(a)} onChange={(e) => toggle(a, e.target.checked)} className="accent-[var(--accent)]" />
                <span className="font-mono text-[11.5px] text-ink-muted" dir="ltr">{a}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-subtle">{t("workspace.overridesNote")}</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="primary" loading={pending} disabled={!userId}
          onClick={() => run(() => upsertMemberAction({ matterId, userId, role, overrides, expiresAt: until || null }), { success: t("common.changesSaved"), onSuccess: onDone })}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, FileText, CalendarClock, Wallet, MessageSquare, KeyRound, Sparkles, Check, X, RotateCcw, ExternalLink, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Input, Select, Textarea } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { relativeTime, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { decideApprovalAction } from "./actions";
import { decideAccessAction } from "../cases/actions";

type A = {
  id: string; kind: string; title: string; entityType: string; entityId: string; status: string; comment: string | null; createdAt: string; decidedAt: string | null;
  requestedBy: string | null; assignedTo: { id: string; name: string } | null; matter: { id: string; label: string } | null;
};
type R = { id: string; name: string; reason: string | null; createdAt: string; matter: { id: string; label: string } };

const ICON: Record<string, LucideIcon> = { DOCUMENT: FileText, DEADLINE_VERIFICATION: CalendarClock, FINANCIAL: Wallet, CLIENT_COMMUNICATION: MessageSquare, AI_TIMELINE: Sparkles, CASE_CHANGE: ShieldCheck };

export function ApprovalsView({ tab, focus, canDecide, meId, approvals, accessRequests }: { tab: string; focus: string | null; canDecide: boolean; meId: string; approvals: A[]; accessRequests: R[] }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [grant, setGrant] = useState<Record<string, { role: string; until: string }>>({});

  const groups = Object.entries(approvals.reduce<Record<string, A[]>>((acc, a) => ((acc[a.kind] ??= []).push(a), acc), {}));
  const link = (a: A) => a.entityType === "Document" ? `/app/documents/${a.entityId}` : a.entityType === "Deadline" && a.matter ? `/app/cases/${a.matter.id}/deadlines` : a.matter ? `/app/cases/${a.matter.id}` : null;
  const decide = (a: A, decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") =>
    run(() => decideApprovalAction({ id: a.id, decision, comment: comments[a.id] || null, dueAt: dates[a.id] || null }), { success: t("approvals.decided"), onSuccess: () => router.refresh() });

  if (!approvals.length && !accessRequests.length) return <div className="mt-6 rounded-lg border border-line bg-surface shadow-xs"><EmptyState icon={<ShieldCheck />} title={t("approvals.empty")} /></div>;

  return (
    <div className="mt-5 space-y-5">
      {accessRequests.length > 0 && (
        <Panel title={t("approvals.accessRequests")} icon={<KeyRound />}>
          <ul className="divide-y divide-line">
            {accessRequests.map((r) => {
              const g = grant[r.id] ?? { role: "OBSERVER", until: "" };
              return (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <p className="text-[13.5px]"><span className="font-medium text-ink">{r.name}</span> <span className="text-ink-muted">→</span> <Link href={`/app/cases/${r.matter.id}/team`} className="text-accent hover:underline">{r.matter.label}</Link> <span className="text-[12px] text-ink-subtle">· {relativeTime(r.createdAt, locale)}</span></p>
                  {r.reason && <p className="rounded bg-surface-muted px-2.5 py-1.5 text-[12.5px] text-ink-muted">{r.reason}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={g.role} onChange={(e) => setGrant({ ...grant, [r.id]: { ...g, role: e.target.value } })} className="h-8 w-44 text-[13px]" aria-label={t("approvals.grantAs")}>
                      <option value="OBSERVER">{t("approvals.viewOnly")}</option><option value="ASSIGNED">{t("approvals.editAccess")}</option><option value="DOCUMENTS_ONLY">{t("approvals.documentsOnly")}</option>
                    </Select>
                    <Input type="date" value={g.until} onChange={(e) => setGrant({ ...grant, [r.id]: { ...g, until: e.target.value } })} className="h-8 w-44 text-[13px]" aria-label={t("approvals.until")} title={t("approvals.until")} />
                    <Button size="sm" variant="primary" loading={pending} onClick={() => run(() => decideAccessAction({ id: r.id, approve: true, role: g.role as never, expiresAt: g.until || null }), { success: t("approvals.decided"), onSuccess: () => router.refresh() })}><Check /> {t("approvals.grant")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => decideAccessAction({ id: r.id, approve: false }), { success: t("approvals.decided"), onSuccess: () => router.refresh() })}><X /> {t("approvals.reject")}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {groups.map(([kind, list]) => {
        const Icon = ICON[kind] ?? ShieldCheck;
        return (
          <Panel key={kind} title={`${t(`approvals.kind.${kind}`)} (${list.length})`} icon={<Icon />}>
            <ul className="divide-y divide-line">
              {list.map((a) => {
                const href = link(a);
                const mine = canDecide || a.assignedTo?.id === meId;
                return (
                  <li key={a.id} id={`a-${a.id}`} className={cn("space-y-2 px-4 py-3", focus === a.id && "bg-accent-soft/40")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-ink">{a.title}</p>
                        <p className="text-[12px] text-ink-subtle">
                          {a.matter && <Link href={`/app/cases/${a.matter.id}`} className="hover:underline">{a.matter.label}</Link>}
                          {a.requestedBy && ` · ${t("approvals.requestedBy")}: ${a.requestedBy}`} · {relativeTime(a.createdAt, locale)}
                        </p>
                      </div>
                      {tab === "history" ? (
                        <Badge tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : "warning"}>{t(`enums.requestStatus.${a.status}`)}</Badge>
                      ) : href && <Button asChild size="xs" variant="ghost"><Link href={href}><ExternalLink /> {t("common.open")}</Link></Button>}
                    </div>
                    {a.comment && <p className="rounded bg-surface-muted px-2.5 py-1.5 text-[12.5px] text-ink-muted">“{a.comment}”</p>}
                    {tab === "history" && a.decidedAt && <p className="text-[11.5px] text-ink-subtle">{formatDateTime(a.decidedAt, locale, tz)}</p>}
                    {tab === "pending" && mine && (
                      <div className="space-y-2">
                        {kind === "DEADLINE_VERIFICATION" && (
                          <div className="flex items-center gap-2 text-[12.5px] text-warning">
                            <span>{t("deadlines.confirmDate")}:</span>
                            <Input type="datetime-local" value={dates[a.id] ?? ""} onChange={(e) => setDates({ ...dates, [a.id]: e.target.value })} className="h-8 w-56 text-[13px]" />
                          </div>
                        )}
                        <Textarea rows={1} value={comments[a.id] ?? ""} onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })} placeholder={t("approvals.comment")} aria-label={t("approvals.comment")} />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="primary" loading={pending} onClick={() => decide(a, "APPROVED")}><Check /> {t("approvals.approve")}</Button>
                          {(kind === "DOCUMENT" || kind === "CLIENT_COMMUNICATION") && <Button size="sm" variant="secondary" loading={pending} onClick={() => decide(a, "CHANGES_REQUESTED")}><RotateCcw /> {t("approvals.requestChanges")}</Button>}
                          {kind !== "DOCUMENT" && <Button size="sm" variant="danger-ghost" loading={pending} onClick={() => decide(a, "REJECTED")}><X /> {t("approvals.reject")}</Button>}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

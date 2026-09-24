"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, FileText, CalendarClock, Wallet, MessageSquare, KeyRound, Sparkles, Check, X, RotateCcw, ExternalLink, Inbox, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { StatusText } from "@/components/ui/badge";
import { EmptyState, DetailList } from "@/components/ui/layout";
import { Input, Select, Textarea, Label } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { relativeTime, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { decideApprovalAction } from "./actions";
import { decideAccessAction } from "../cases/actions";

type A = {
  id: string; kind: string; title: string; entityType: string; entityId: string; status: string; comment: string | null; createdAt: string; decidedAt: string | null;
  requestedBy: string | null; assignedTo: { id: string; name: string } | null; matter: { id: string; label: string; number: string } | null;
};
type R = { id: string; name: string; reason: string | null; createdAt: string; matter: { id: string; label: string; number: string } };
type Item = ({ type: "approval" } & A) | ({ type: "access"; kind: "ACCESS"; title: string } & R);

const ICON: Record<string, LucideIcon> = { DOCUMENT: FileText, DEADLINE_VERIFICATION: CalendarClock, FINANCIAL: Wallet, CLIENT_COMMUNICATION: MessageSquare, AI_TIMELINE: Sparkles, CASE_CHANGE: ShieldCheck, ACCESS: KeyRound };

/** Approval Center as a work queue: filters · list · preview with the decision. */
export function ApprovalsView({ tab, focus, canDecide, meId, approvals, accessRequests }: { tab: string; focus: string | null; canDecide: boolean; meId: string; approvals: A[]; accessRequests: R[] }) {
  const { t, locale, tz } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const items: Item[] = [
    ...accessRequests.map((r) => ({ ...r, type: "access" as const, kind: "ACCESS" as const, title: `${r.name} → ${r.matter.number}` })),
    ...approvals.map((a) => ({ ...a, type: "approval" as const })),
  ];
  const kinds = [...new Set(items.map((i) => i.kind))];
  const [kind, setKind] = useState<string | null>(null);
  const visible = kind ? items.filter((i) => i.kind === kind) : items;
  const [selId, setSelId] = useState<string | null>(focus && items.some((i) => i.id === focus) ? focus : visible[0]?.id ?? null);
  const sel = visible.find((i) => i.id === selId) ?? visible[0] ?? null;
  const [comment, setComment] = useState("");
  const [date, setDate] = useState("");
  const [grant, setGrant] = useState({ role: "OBSERVER", until: "" });

  const done = () => {
    setComment("");
    setDate("");
    router.refresh();
  };
  const decide = (a: A, decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") =>
    run(() => decideApprovalAction({ id: a.id, decision, comment: comment || null, dueAt: date || null }), { success: t("approvals.decided"), onSuccess: done });
  const openLink = (a: A) => (a.entityType === "Document" ? `/app/documents/${a.entityId}` : a.entityType === "Deadline" && a.matter ? `/app/cases/${a.matter.id}/deadlines` : a.matter ? `/app/cases/${a.matter.id}` : null);

  const rail = (
    <nav aria-label={t("approvals.title")} className="space-y-5">
      <ul className="space-y-0.5">
        {(["pending", "history"] as const).map((k) => (
          <li key={k}>
            <Link href={`/app/approvals?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("flex h-8 items-center gap-2 rounded-md px-2.5 text-body transition-colors", tab === k ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
              {k === "pending" ? <Inbox className="size-4 text-ink-subtle" /> : <Check className="size-4 text-ink-subtle" />}
              <span className="flex-1">{t(`approvals.${k}`)}</span>
              {k === tab && <span className="text-meta tabular text-ink-subtle">{items.length}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {kinds.length > 1 && (
        <div>
          <div className="eyebrow px-2.5">{t("common.type")}</div>
          <ul className="mt-1.5 space-y-0.5">
            {[null, ...kinds].map((k) => {
              const Icon = k ? ICON[k] ?? ShieldCheck : null;
              const n = k ? items.filter((i) => i.kind === k).length : items.length;
              return (
                <li key={k ?? "all"}>
                  <button type="button" onClick={() => setKind(k)} className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-start text-body transition-colors", kind === k ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}>
                    {Icon ? <Icon className="size-4 text-ink-subtle" /> : <span className="size-4" />}
                    <span className="min-w-0 flex-1 truncate">{k ? (k === "ACCESS" ? t("approvals.accessRequests") : t(`approvals.kind.${k}`)) : t("common.all")}</span>
                    <span className="text-meta tabular text-ink-subtle">{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );

  const list = visible.length === 0 ? (
    <EmptyState icon={<ShieldCheck />} title={t("approvals.empty")} />
  ) : (
    <ul role="listbox" aria-label={t("approvals.title")} className="divide-y divide-line/80">
      {visible.map((i) => {
        const Icon = ICON[i.kind] ?? ShieldCheck;
        const on = sel?.id === i.id;
        return (
          <li key={i.id} role="option" aria-selected={on}>
            <button type="button" onClick={() => { setSelId(i.id); setComment(""); setDate(""); }} className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-start transition-colors", on ? "bg-accent-soft/70" : "hover:bg-surface-muted")}>
              <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="bidi-plain block truncate text-body font-medium text-ink">{i.title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-meta text-ink-subtle">
                  {i.matter && <span className="record-id">{i.matter.number}</span>}
                  <span className="truncate">· {i.type === "access" ? i.name : i.requestedBy ?? "—"}</span>
                </span>
              </span>
              <span className="shrink-0 text-meta text-ink-subtle">
                {tab === "history" && i.type === "approval" ? (
                  <StatusText tone={i.status === "APPROVED" ? "success" : i.status === "REJECTED" ? "danger" : "warning"} className="text-meta">{t(`enums.requestStatus.${i.status}`)}</StatusText>
                ) : relativeTime(i.createdAt, locale)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const preview = !sel ? null : (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-meta text-ink-subtle">{sel.kind === "ACCESS" ? t("approvals.accessRequests") : t(`approvals.kind.${sel.kind}`)}</div>
          <h2 className="bidi-plain mt-0.5 text-heading font-semibold text-ink">{sel.title}</h2>
        </div>
        {sel.type === "approval" && openLink(sel) && (
          <Button asChild size="sm" variant="secondary"><Link href={openLink(sel)!}><ExternalLink /> {t("common.open")}</Link></Button>
        )}
      </div>

      <DetailList
        className="mt-4"
        items={[
          ...(sel.matter ? [{ key: "case", label: t("cases.col.case"), value: <Link href={`/app/cases/${sel.matter.id}`} className="bidi-plain hover:underline">{sel.matter.label}</Link> }] : []),
          { key: "by", label: t("home.submittedBy"), value: sel.type === "access" ? sel.name : sel.requestedBy ?? "—" },
          { key: "since", label: t("home.waiting"), value: relativeTime(sel.createdAt, locale) },
          ...(sel.type === "approval" && sel.decidedAt ? [{ key: "dec", label: t("common.status"), value: <span>{t(`enums.requestStatus.${sel.status}`)} · {formatDateTime(sel.decidedAt, locale, tz)}</span> }] : []),
        ]}
      />
      {(sel.type === "access" ? sel.reason : sel.comment) && (
        <p className="bidi-plain mt-3 border-s-2 border-line ps-3 text-body text-ink-muted">“{sel.type === "access" ? sel.reason : sel.comment}”</p>
      )}

      {tab === "pending" && sel.type === "approval" && (canDecide || sel.assignedTo?.id === meId) && (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          {sel.kind === "DEADLINE_VERIFICATION" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-date" className="text-warning">{t("deadlines.confirmDate")}</Label>
              <Input id="ap-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-64" />
            </div>
          )}
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("approvals.comment")} aria-label={t("approvals.comment")} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={pending} onClick={() => decide(sel, "APPROVED")}><Check /> {t("approvals.approve")}</Button>
            {(sel.kind === "DOCUMENT" || sel.kind === "CLIENT_COMMUNICATION") && <Button variant="secondary" loading={pending} onClick={() => decide(sel, "CHANGES_REQUESTED")}><RotateCcw /> {t("approvals.requestChanges")}</Button>}
            {sel.kind !== "DOCUMENT" && <Button variant="danger-ghost" loading={pending} onClick={() => decide(sel, "REJECTED")}><X /> {t("approvals.reject")}</Button>}
          </div>
        </div>
      )}

      {tab === "pending" && sel.type === "access" && (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select value={grant.role} onChange={(e) => setGrant({ ...grant, role: e.target.value })} aria-label={t("approvals.grantAs")}>
              <option value="OBSERVER">{t("approvals.viewOnly")}</option><option value="ASSIGNED">{t("approvals.editAccess")}</option><option value="DOCUMENTS_ONLY">{t("approvals.documentsOnly")}</option>
            </Select>
            <Input type="date" value={grant.until} onChange={(e) => setGrant({ ...grant, until: e.target.value })} aria-label={t("approvals.until")} title={t("approvals.until")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={pending} onClick={() => run(() => decideAccessAction({ id: sel.id, approve: true, role: grant.role as never, expiresAt: grant.until || null }), { success: t("approvals.decided"), onSuccess: done })}><Check /> {t("approvals.grant")}</Button>
            <Button variant="danger-ghost" onClick={() => run(() => decideAccessAction({ id: sel.id, approve: false }), { success: t("approvals.decided"), onSuccess: done })}><X /> {t("approvals.reject")}</Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-4 grid min-h-[60vh] grid-cols-1 overflow-hidden rounded-lg border border-line lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="border-b border-line bg-canvas p-3 lg:border-b-0 lg:border-e">{rail}</aside>
      <div className="min-w-0 border-b border-line lg:border-b-0 lg:border-e">{list}</div>
      <div className="min-w-0">{preview ?? <EmptyState compact icon={<ShieldCheck />} title={t("approvals.empty")} />}</div>
    </div>
  );
}

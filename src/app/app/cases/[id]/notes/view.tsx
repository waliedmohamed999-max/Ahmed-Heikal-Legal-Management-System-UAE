"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Users, Globe, Pin, PinOff, Trash2, Send, MessageSquare } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Textarea, Checkbox } from "@/components/ui/form";
import { Avatar, EmptyState, Panel } from "@/components/ui/layout";
import { useAction } from "@/components/forms";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { createNoteAction, updateNoteAction, addCommentAction } from "../../../collab-actions";

type Note = { id: string; body: string; createdAt: string; author: string; authorId: string; photoUrl: string | null; visibility: string; pinned: boolean };
type Comment = { id: string; body: string; createdAt: string; author: string; authorId: string; photoUrl: string | null };

const CHANNELS = [
  { key: "TEAM", icon: Users, label: "workspace.notesTeam", hint: "workspace.notesTeamHint", tone: "text-info" },
  { key: "PRIVATE", icon: Lock, label: "workspace.notesPrivate", hint: "workspace.notesPrivateHint", tone: "text-ink-muted" },
  { key: "CLIENT", icon: Globe, label: "workspace.notesClient", hint: "workspace.notesClientHint", tone: "text-warning" },
] as const;

/** Renders @mentions highlighted without using innerHTML. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}][\p{L}.\-]*)/u);
  return (
    <p className="bidi-plain whitespace-pre-line text-body leading-relaxed text-ink">
      {parts.map((p, i) => (p.startsWith("@") ? <span key={i} className="rounded bg-accent-soft px-0.5 font-medium text-accent">{p}</span> : p))}
    </p>
  );
}

export function NotesView({ matterId, meId, canCreate, canShare, canModerate, notes, comments }: {
  matterId: string; meId: string; canCreate: boolean; canShare: boolean; canModerate: boolean; notes: Note[]; comments: Comment[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [channel, setChannel] = useState<"TEAM" | "PRIVATE" | "CLIENT">("TEAM");
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [comment, setComment] = useState("");
  const { run, pending } = useAction();
  const list = notes.filter((n) => n.visibility === channel);
  const ch = CHANNELS.find((c) => c.key === channel)!;
  const channels = CHANNELS.filter((c) => c.key !== "CLIENT" || canShare || notes.some((n) => n.visibility === "CLIENT"));

  const save = () =>
    run(() => createNoteAction({ matterId, body, visibility: channel, confirmClientVisible: confirm }), {
      success: t("common.changesSaved"),
      onSuccess: () => { setBody(""); setConfirm(false); router.refresh(); },
    });

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <div className="mb-3 flex gap-1 rounded-lg border border-line bg-surface p-1 shadow-xs" role="tablist">
          {channels.map((c) => (
            <button key={c.key} role="tab" aria-selected={channel === c.key} type="button" onClick={() => { setChannel(c.key); setConfirm(false); }}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium", channel === c.key ? "bg-brand text-brand-fg" : "text-ink-muted hover:bg-surface-muted")}>
              <c.icon className="size-4" /> {t(c.label)}
              <span className="text-caption opacity-70 tabular">{notes.filter((n) => n.visibility === c.key).length}</span>
            </button>
          ))}
        </div>
        <p className={cn("mb-3 flex items-center gap-1.5 text-meta", ch.tone)}><ch.icon className="size-3.5" /> {t(ch.hint)}</p>

        {canCreate && (channel !== "CLIENT" || canShare) && (
          <div className={cn("mb-4 rounded-lg border bg-surface p-3 shadow-xs", channel === "CLIENT" ? "border-warning/40" : "border-line")}>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={t("workspace.newNote")} aria-label={t("workspace.newNote")} className="border-0 p-0 shadow-none focus:ring-0" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
              {channel === "CLIENT" ? <Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} label={<span className="text-meta text-warning">{t("workspace.confirmClient")}</span>} /> : <span />}
              <Button size="sm" variant="primary" loading={pending} disabled={!body.trim() || (channel === "CLIENT" && !confirm)} onClick={save}>{t("workspace.addNote")}</Button>
            </div>
          </div>
        )}

        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong"><EmptyState compact title={t("workspace.notesEmpty")} /></div>
        ) : (
          <ul className="space-y-3">
            {list.map((n) => (
              <li key={n.id} className={cn("group rounded-lg border bg-surface p-4 shadow-xs", n.pinned ? "border-accent/40" : "border-line")}>
                <div className="mb-2 flex items-center gap-2">
                  <Avatar name={n.author} src={n.photoUrl} size={24} />
                  <span className="text-body font-medium">{n.author}</span>
                  <span className="text-meta text-ink-subtle">· {relativeTime(n.createdAt, locale)}</span>
                  {n.pinned && <Pin className="size-3.5 text-accent" aria-label="pinned" />}
                  {(n.authorId === meId || canModerate) && (
                    <div className="ms-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button size="icon-xs" variant="ghost" aria-label={n.pinned ? t("workspace.unpin") : t("workspace.pin")} onClick={() => run(() => updateNoteAction({ id: n.id, matterId, pinned: !n.pinned }), { onSuccess: () => router.refresh() })}>
                        {n.pinned ? <PinOff /> : <Pin />}
                      </Button>
                      <Button size="icon-xs" variant="danger-ghost" aria-label={t("common.delete")} onClick={() => run(() => updateNoteAction({ id: n.id, matterId, delete: true }), { onSuccess: () => router.refresh() })}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                <Body text={n.body} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="xl:col-span-5">
        <Panel title={t("workspace.comments")} icon={<MessageSquare />}>
          <ul className="max-h-[520px] divide-y divide-line overflow-y-auto scrollbar-thin">
            {comments.length === 0 && <EmptyState compact title="—" />}
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2.5 px-4 py-3">
                <Avatar name={c.author} src={c.photoUrl} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="text-meta"><span className="font-medium">{c.author}</span> <span className="text-ink-subtle">· {relativeTime(c.createdAt, locale)}</span></div>
                  <Body text={c.body} />
                </div>
              </li>
            ))}
          </ul>
          <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; run(() => addCommentAction({ matterId, body: comment }), { onSuccess: () => { setComment(""); router.refresh(); } }); }}>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder={t("workspace.commentPlaceholder")} aria-label={t("workspace.comments")} />
            <Button type="submit" size="icon" variant="primary" disabled={!comment.trim()} loading={pending} aria-label={t("common.submit")}><Send className="rtl:-scale-x-100" /></Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

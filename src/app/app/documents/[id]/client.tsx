"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Send, Pencil, Check, X, Sparkles } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { Panel, Avatar } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Uploader } from "@/components/uploader";
import { useAction } from "@/components/forms";
import { relativeTime } from "@/lib/time";
import { transitionDocAction, deleteDocAction, updateDocMetaAction } from "../actions";
import { addCommentAction } from "../../collab-actions";

const CATEGORIES = ["COURT", "CLIENT", "EVIDENCE", "CONTRACT", "LEGAL_MEMO", "CORRESPONDENCE", "JUDGMENT", "INVOICE", "POWER_OF_ATTORNEY", "EXPERT_REPORT", "SUBMISSION", "OTHER"];

type Doc = { id: string; title: string; description: string | null; category: string; tags: string[]; confidentiality: string; portalShared: boolean; matterId: string | null };

export function DocumentActions({ doc, transitions, caps, canEdit }: { doc: Doc; transitions: string[]; caps: string[]; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const [comment, setComment] = useState("");
  const [upload, setUpload] = useState(false);
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState({ ...doc, tags: doc.tags.join(", "), description: doc.description ?? "" });
  const has = (c: string) => caps.includes(c);

  return (
    <Panel title={t("documents.workflow")}>
      <div className="space-y-3 p-4">
        {transitions.length > 0 && (
          <>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("documents.workflowComment")} aria-label={t("documents.workflowComment")} />
            <div className="flex flex-wrap gap-2">
              {transitions.map((to) => (
                <Button key={to} size="sm" variant={to === "APPROVED" ? "primary" : to === "CHANGES_REQUESTED" ? "danger-ghost" : "secondary"} loading={pending}
                  onClick={() => run(() => transitionDocAction({ id: doc.id, to: to as never, comment: comment || null }), { success: t("common.changesSaved"), onSuccess: () => { setComment(""); router.refresh(); } })}>
                  {t(`documents.to.${to}`)}
                </Button>
              ))}
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {has("documents.upload") && <Button size="sm" variant="secondary" onClick={() => setUpload(true)}><Upload /> {t("documents.newVersion")}</Button>}
          {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}><Pencil /> {t("common.edit")}</Button>}
          {has("ai.use") && doc.matterId && <Button asChild size="sm" variant="ghost"><Link href={`/app/ai?matter=${doc.matterId}&document=${doc.id}&task=DOCUMENT_SUMMARY`}><Sparkles /> {t("ai.summarizeDocument")}</Link></Button>}
          {has("documents.delete") && (
            <Button size="sm" variant="danger-ghost" onClick={() => { if (confirm(t("documents.delete") + "?")) run(() => deleteDocAction({ id: doc.id }), { success: t("documents.deleted"), onSuccess: () => router.push(doc.matterId ? `/app/cases/${doc.matterId}/documents` : "/app/documents") }); }}>
              <Trash2 /> {t("common.delete")}
            </Button>
          )}
        </div>
        {!editing ? (
          <dl className="space-y-2 border-t border-line pt-3 text-meta">
            {doc.description && <div><dt className="text-ink-subtle">{t("documents.fields.description")}</dt><dd className="text-ink">{doc.description}</dd></div>}
            <div><dt className="text-ink-subtle">{t("documents.fields.tags")}</dt><dd className="flex flex-wrap gap-1">{doc.tags.length ? doc.tags.map((x) => <Badge key={x} tone="outline">{x}</Badge>) : "—"}</dd></div>
            <div><dt className="text-ink-subtle">{t("documents.fields.portalShared")}</dt><dd>{doc.portalShared ? t("common.yes") : t("common.no")}</dd></div>
          </dl>
        ) : (
          <div className="grid gap-3 border-t border-line pt-3">
            <Field label={t("documents.fields.title")}>{(a) => <Input {...a} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />}</Field>
            <Field label={t("documents.fields.category")}>{(a) => <Select {...a} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`enums.documentCategory.${c}`)}</option>)}</Select>}</Field>
            <Field label={t("documents.fields.confidentiality")}>{(a) => <Select {...a} value={meta.confidentiality} onChange={(e) => setMeta({ ...meta, confidentiality: e.target.value })}>{["STANDARD", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"].map((c) => <option key={c} value={c}>{t(`enums.confidentiality.${c}`)}</option>)}</Select>}</Field>
            <Field label={t("documents.fields.tags")} hint={t("documents.tagsHint")}>{(a) => <Input {...a} value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />}</Field>
            <Field label={t("documents.fields.description")}>{(a) => <Textarea {...a} rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />}</Field>
            {has("documents.share") && <Checkbox label={t("documents.fields.portalShared")} checked={meta.portalShared} onChange={(e) => setMeta({ ...meta, portalShared: e.target.checked })} />}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X /> {t("common.cancel")}</Button>
              <Button size="sm" variant="primary" loading={pending} onClick={() => run(() => updateDocMetaAction({
                id: doc.id, title: meta.title, description: meta.description || null, category: meta.category as never, confidentiality: meta.confidentiality as never, portalShared: meta.portalShared,
                tags: meta.tags.split(",").map((s) => s.trim()).filter(Boolean),
              }), { success: t("documents.metaSaved"), onSuccess: () => { setEditing(false); router.refresh(); } })}><Check /> {t("common.save")}</Button>
            </div>
          </div>
        )}
      </div>
      <Dialog open={upload} onOpenChange={setUpload}>
        {upload && <DialogContent title={t("documents.newVersion")} size="lg"><Uploader documentId={doc.id} onDone={() => setUpload(false)} /></DialogContent>}
      </Dialog>
    </Panel>
  );
}

export function DocumentComments({ documentId, comments }: { documentId: string; comments: { id: string; body: string; createdAt: string; author: string; photoUrl: string | null }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [body, setBody] = useState("");
  const { run, pending } = useAction();
  return (
    <div>
      <ul className="divide-y divide-line">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2.5 px-4 py-3">
            <Avatar name={c.author} src={c.photoUrl} size={24} />
            <div className="text-body"><span className="font-medium">{c.author}</span> <span className="text-meta text-ink-subtle">{relativeTime(c.createdAt, locale)}</span><p className="whitespace-pre-line text-ink">{c.body}</p></div>
          </li>
        ))}
      </ul>
      <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) run(() => addCommentAction({ documentId, body }), { onSuccess: () => { setBody(""); router.refresh(); } }); }}>
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("workspace.commentPlaceholder")} aria-label={t("tasks.comments")} />
        <Button type="submit" size="icon" variant="primary" disabled={!body.trim()} loading={pending} aria-label={t("common.submit")}><Send className="rtl:-scale-x-100" /></Button>
      </form>
    </div>
  );
}

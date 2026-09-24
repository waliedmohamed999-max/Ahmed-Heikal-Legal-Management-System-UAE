"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { formatBytes, cn } from "@/lib/utils";

const CATEGORIES = ["COURT", "CLIENT", "EVIDENCE", "CONTRACT", "LEGAL_MEMO", "CORRESPONDENCE", "JUDGMENT", "INVOICE", "POWER_OF_ATTORNEY", "EXPERT_REPORT", "SUBMISSION", "OTHER"];
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.tif,.tiff,.zip,.eml,.msg";
const MAX = 100 * 1024 * 1024;

type Item = { id: string; file: File; name: string; progress: number; state: "queued" | "uploading" | "done" | "error"; error?: string };

/** XHR upload so we get real progress events (fetch has none for uploads). */
function send(url: string, form: FormData, onProgress: (p: number) => void) {
  return new Promise<{ ok: boolean; status: number; body: { error?: string; id?: string } }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      resolve({ ok: xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, body: { error: "network" } });
    xhr.send(form);
  });
}

export function Uploader({ matterId, matterLabel, documentId, suggest, onDone }: {
  matterId?: string | null; matterLabel?: string | null; documentId?: string; suggest?: { number?: string | null; client?: string | null }; onDone?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [target, setTarget] = useState<string | null>(matterId ?? null);
  const [meta, setMeta] = useState({ category: "OTHER", confidentiality: "STANDARD", tags: "", description: "", comment: "" });
  const busy = items.some((i) => i.state === "uploading");

  const suggestName = (f: File) => {
    if (!suggest?.number) return f.name;
    const ext = f.name.split(".").pop();
    const slug = (s: string) => s.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 30);
    return [suggest.number, suggest.client ? slug(suggest.client) : null, meta.category, new Date().toISOString().slice(0, 10)].filter(Boolean).join("_") + "." + ext;
  };

  const add = useCallback((files: FileList | File[]) => {
    const next = [...files].map((f) => ({
      id: crypto.randomUUID(), file: f, name: f.name, progress: 0,
      state: (f.size > MAX ? "error" : "queued") as Item["state"], error: f.size > MAX ? t("errors.fileTooLarge") : undefined,
    }));
    setItems((cur) => (documentId ? next.slice(0, 1) : [...cur, ...next]));
  }, [documentId, t]);

  const start = async () => {
    const queue = items.filter((i) => i.state === "queued");
    await Promise.all(
      queue.map(async (it) => {
        const form = new FormData();
        form.append("file", it.file);
        form.append("meta", JSON.stringify({
          matterId: target, documentId: documentId ?? null, category: meta.category, confidentiality: meta.confidentiality, description: meta.description || null,
          tags: meta.tags.split(",").map((s) => s.trim()).filter(Boolean), comment: meta.comment || null, fileName: it.name,
          title: it.file.name.replace(/\.[^.]+$/, ""),
        }));
        setItems((c) => c.map((x) => (x.id === it.id ? { ...x, state: "uploading" } : x)));
        const r = await send("/api/documents/upload", form, (p) => setItems((c) => c.map((x) => (x.id === it.id ? { ...x, progress: p } : x))));
        setItems((c) => c.map((x) => (x.id === it.id ? { ...x, state: r.ok ? "done" : "error", progress: r.ok ? 100 : x.progress, error: r.ok ? undefined : t(`errors.${r.body.error ?? "unexpected"}`) } : x)));
      }),
    );
    router.refresh();
    onDone?.();
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={cn("flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-accent bg-accent-soft" : "border-line-strong hover:border-ink-subtle hover:bg-surface-muted/50")}
      >
        <UploadCloud className="size-8 text-ink-subtle" />
        <span className="text-ui font-medium text-ink">{t("documents.dropHere")}</span>
        <span className="text-meta text-ink-subtle">{t("documents.dropHint")}</span>
      </button>
      <input ref={input} type="file" multiple={!documentId} accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && add(e.target.files)} aria-label={t("documents.upload")} />

      {!documentId && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!matterId && (
            <Field label={t("documents.selectCase")} className="sm:col-span-2">
              {(a) => <Picker {...a} type="matters" value={target} initialLabel={matterLabel} onChange={(i) => setTarget(i?.id ?? null)} placeholder={t("documents.clientLevel")} />}
            </Field>
          )}
          <Field label={t("documents.fields.category")}>{(a) => <Select {...a} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`enums.documentCategory.${c}`)}</option>)}</Select>}</Field>
          <Field label={t("documents.fields.confidentiality")}>{(a) => <Select {...a} value={meta.confidentiality} onChange={(e) => setMeta({ ...meta, confidentiality: e.target.value })}>{["STANDARD", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"].map((c) => <option key={c} value={c}>{t(`enums.confidentiality.${c}`)}</option>)}</Select>}</Field>
          <Field label={t("documents.fields.tags")} hint={t("documents.tagsHint")}>{(a) => <Input {...a} value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />}</Field>
          <Field label={t("documents.fields.description")}>{(a) => <Input {...a} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />}</Field>
        </div>
      )}
      {documentId && (
        <Field label={t("documents.fields.comment")} hint={t("documents.newVersionHint")}>{(a) => <Textarea {...a} rows={2} value={meta.comment} onChange={(e) => setMeta({ ...meta, comment: e.target.value })} />}</Field>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="size-4 shrink-0 text-ink-subtle" />
              <div className="min-w-0 flex-1">
                {it.state === "queued" ? (
                  <div className="flex items-center gap-2">
                    <Input value={it.name} onChange={(e) => setItems((c) => c.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))} className="h-7 text-meta" dir="ltr" aria-label={t("documents.fields.fileName")} />
                    {suggest?.number && <Button type="button" size="xs" variant="ghost" onClick={() => setItems((c) => c.map((x) => (x.id === it.id ? { ...x, name: suggestName(x.file) } : x)))}>{t("documents.suggestedName")}</Button>}
                  </div>
                ) : (
                  <p className="ltr-nums truncate text-body text-ink">{it.name}</p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className={cn("h-full transition-all", it.state === "error" ? "bg-danger" : it.state === "done" ? "bg-success" : "bg-accent")} style={{ width: `${it.state === "error" ? 100 : it.progress}%` }} />
                  </div>
                  <span className="w-16 text-end text-caption tabular text-ink-subtle">{formatBytes(it.file.size)}</span>
                </div>
                {it.error && <p className="mt-0.5 text-meta text-danger">{it.error}</p>}
              </div>
              {it.state === "done" ? <CheckCircle2 className="size-4 text-success" /> : it.state === "error" ? <AlertCircle className="size-4 text-danger" /> : it.state === "queued" && (
                <button type="button" aria-label={t("common.remove")} onClick={() => setItems((c) => c.filter((x) => x.id !== it.id))}><X className="size-4 text-ink-subtle" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button variant="primary" loading={busy} disabled={!items.some((i) => i.state === "queued")} onClick={start}>
          <UploadCloud /> {busy ? t("documents.uploading") : t("documents.upload")}
        </Button>
      </div>
    </div>
  );
}

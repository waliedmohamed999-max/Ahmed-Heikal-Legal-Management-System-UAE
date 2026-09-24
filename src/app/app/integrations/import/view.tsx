"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileInput, Check, X, AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { Panel, EmptyState } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Textarea, Label } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { useAction } from "@/components/forms";
import { SUGGESTION_KINDS, type Suggestion, type SuggestionKind } from "@/lib/court-import";
import { formatDateTime } from "@/lib/time";
import { applyImportAction, discardImportAction } from "./actions";

type Item = Suggestion & { on: boolean; title: string };
type Result = { id: string; status: "ok" | "ocrMissing" | "unsupported"; suggestions: Suggestion[]; excerpt: string };

export function ImportView({ history }: { history: { id: string; sourceType: string; status: string; createdAt: string; count: number }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [matter, setMatter] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  async function analyse(file?: File) {
    const form = new FormData();
    if (file) form.set("file", file);
    else form.set("text", text);
    if (matter) form.set("matterId", matter);
    setBusy(true);
    try {
      const r = await fetch("/api/court-import", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) {
        toast.error(t(`errors.${data.error ?? "unexpected"}`));
        return;
      }
      setRes(data);
      // Nothing is pre-selected: the reviewer opts in to each item.
      setItems((data as Result).suggestions.map((s) => ({ ...s, on: false, title: s.kind === "CASE_NUMBER" ? s.value : s.value.slice(0, 200) })));
    } catch {
      toast.error(t("errors.network"));
    } finally {
      setBusy(false);
    }
  }

  const upd = (i: number, p: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const selected = items.filter((x) => x.on);
  const apply = () =>
    res && matter &&
    run(() => applyImportAction({ importId: res.id, matterId: matter, items: selected.map((x) => ({ kind: x.kind, title: x.title, date: x.date ?? "" })) }), {
      success: t("courtImport.applied"),
      onSuccess: () => { setRes(null); setItems([]); setText(""); router.refresh(); },
    });

  return (
    <div className="mt-6 space-y-5">
      {!res && (
        <Panel title={t("courtImport.upload")} icon={<FileInput />}>
          <div className="grid gap-4 p-5">
            <div>
              <Label>{t("courtImport.matter")}</Label>
              <div className="mt-1.5 max-w-md"><Picker type="matters" value={matter} onChange={(i) => setMatter(i?.id ?? null)} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" hidden accept=".pdf,.csv,.txt,.eml,.docx,.png,.jpg,.jpeg,.webp,.tif,.tiff" onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyse(f); e.target.value = ""; }} />
              <Button variant="primary" loading={busy} onClick={() => fileRef.current?.click()}><Upload /> {t("courtImport.upload")}</Button>
              <span className="text-meta text-ink-subtle" dir="ltr">PDF · CSV · TXT · EML · DOCX</span>
            </div>
            <div>
              <Label htmlFor="ci-text">{t("courtImport.source")}</Label>
              <Textarea id="ci-text" className="mt-1.5" rows={6} value={text} onChange={(e) => setText(e.target.value)} dir="auto" />
              <div className="mt-2 flex justify-end"><Button variant="secondary" disabled={text.trim().length < 3} loading={busy} onClick={() => void analyse()}>{t("courtImport.suggestions")}</Button></div>
            </div>
          </div>
        </Panel>
      )}

      {res && (
        <Panel
          title={t("courtImport.suggestions")}
          actions={<Button size="sm" variant="ghost" onClick={() => run(() => discardImportAction({ id: res.id }), { onSuccess: () => { setRes(null); setItems([]); router.refresh(); } })}><X /> {t("courtImport.discard")}</Button>}
        >
          {res.status === "ocrMissing" && <p className="m-4 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-meta text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {t("courtImport.ocrMissing")}</p>}
          {res.status === "unsupported" && <p className="m-4 text-meta text-warning">{t("errors.unsupported")}</p>}
          {items.length === 0 ? (
            <EmptyState compact title={t("courtImport.noSuggestions")} />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it, i) => (
                <li key={i} className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_150px_170px_1fr] sm:items-center">
                  <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={it.on} onChange={(e) => upd(i, { on: e.target.checked })} aria-label={t("common.apply")} />
                  <Select value={it.kind} onChange={(e) => upd(i, { kind: e.target.value as SuggestionKind })} aria-label={t("common.type")}>
                    {SUGGESTION_KINDS.map((k) => <option key={k} value={k}>{t(`courtImport.kinds.${k}`)}</option>)}
                  </Select>
                  {it.kind === "CASE_NUMBER" || it.kind === "COURT" ? <span /> : (
                    <Input type="datetime-local" dir="ltr" value={it.date ? (it.date.length > 10 ? it.date : `${it.date}T09:00`) : ""} onChange={(e) => upd(i, { date: e.target.value })} aria-label={t("common.date")} />
                  )}
                  <Input value={it.title} onChange={(e) => upd(i, { title: e.target.value })} dir="auto" aria-label={t("common.title")} />
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <span className="text-meta text-ink-subtle">{!matter && t("courtImport.matter")}</span>
              <div className="flex items-center gap-3">
                {!matter && <div className="w-72"><Picker type="matters" value={matter} onChange={(x) => setMatter(x?.id ?? null)} /></div>}
                <Button variant="primary" disabled={!matter || !selected.length} loading={pending} onClick={apply}><Check /> {t("courtImport.apply")} ({selected.length})</Button>
              </div>
            </div>
          )}
          {res.excerpt && (
            <details className="border-t border-line px-4 py-3">
              <summary className="cursor-pointer text-meta font-medium text-ink-muted">{t("courtImport.source")}</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-sans text-meta text-ink-muted" dir="auto">{res.excerpt}</pre>
            </details>
          )}
        </Panel>
      )}

      <Panel title={t("courtImport.history")} icon={<History />}>
        {history.length === 0 ? <EmptyState compact title={t("courtImport.noSuggestions").split(".")[0]} /> : (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-body">
                <span className="text-ink-subtle">{formatDateTime(h.createdAt, locale)}</span>
                <Badge tone="neutral">{h.sourceType}</Badge>
                <span className="flex-1 text-ink-muted">{t("common.items", { n: h.count })}</span>
                <Badge tone={h.status === "APPLIED" ? "success" : h.status === "DISCARDED" ? "neutral" : "warning"}>{h.status === "APPLIED" ? t("common.apply") : h.status === "DISCARDED" ? t("courtImport.discard") : t("enums.documentStatus.UNDER_REVIEW")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

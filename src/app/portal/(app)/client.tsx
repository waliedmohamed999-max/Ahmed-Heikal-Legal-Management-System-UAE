"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Upload, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useAction } from "@/components/forms";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { portalMessageAction } from "../actions";

export function PortalMessages({ matterId, messages }: { matterId: string; messages: { id: string; body: string; mine: boolean; at: string }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [body, setBody] = useState("");
  const { run, pending } = useAction();
  return (
    <div className="rounded-md border border-line">
      <p className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-meta font-semibold text-ink-muted"><MessageSquare className="size-3.5" /> {t("portal.messages")}</p>
      {messages.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto p-3 scrollbar-thin">
          {messages.map((m) => (
            <li key={m.id} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-body", m.mine ? "ms-auto bg-brand text-brand-fg" : "bg-surface-muted text-ink")}>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={cn("mt-0.5 text-[10.5px]", m.mine ? "text-white/70" : "text-ink-subtle")}>{m.mine ? t("portal.fromYou") : t("portal.fromOffice")} · {relativeTime(m.at, locale)}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="flex items-end gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) run(() => portalMessageAction({ matterId, body }), { success: t("portal.sent"), onSuccess: () => { setBody(""); router.refresh(); } }); }}>
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("portal.messagePlaceholder")} aria-label={t("portal.messages")} />
        <Button type="submit" variant="primary" size="icon" loading={pending} disabled={!body.trim()} aria-label={t("portal.send")}><Send className="rtl:-scale-x-100" /></Button>
      </form>
    </div>
  );
}

export function PortalUpload({ matterId }: { matterId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList) => {
    setBusy(true);
    for (const f of Array.from(files)) {
      const form = new FormData();
      form.append("file", f);
      form.append("matterId", matterId);
      const r = await fetch("/api/portal/upload", { method: "POST", body: form });
      if (!r.ok) toast.error(t(`errors.${(await r.json().catch(() => ({}))).error ?? "unexpected"}`));
    }
    setBusy(false);
    toast.success(t("documents.uploaded"));
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" loading={busy} onClick={() => ref.current?.click()}><Upload /> {t("portal.uploads")}</Button>
      <span className="text-meta text-ink-subtle">{t("portal.uploadHint")}</span>
      <input ref={ref} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(e) => e.target.files && upload(e.target.files)} />
    </div>
  );
}

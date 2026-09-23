"use client";

import { useState } from "react";
import { ChevronDown, Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/forms";
import { verifyAuditAction } from "./actions";

export function AuditTools({ canExport, query }: { canExport: boolean; query: string }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  return (
    <>
      <Button variant="secondary" loading={pending} onClick={() => run(() => verifyAuditAction({}), { onSuccess: (r) => { const d = r as { ok: boolean; checked: number; brokenAt?: string }; if (d.ok) toast.success(t("audit.verifyOk", { n: d.checked })); else toast.error(t("audit.verifyBroken", { id: d.brokenAt ?? "" })); } })}>
        <ShieldCheck /> {t("audit.verify")}
      </Button>
      {canExport && <Button asChild variant="secondary"><a href={`/api/audit/export?${query}`}><Download /> {t("audit.export")}</a></Button>}
    </>
  );
}

type Row = { id: string; time: string; actor: string; action: string; record: string; ip: string | null; ua: string | null; before: unknown; after: unknown; metadata: unknown; hash: string };

export function AuditRow({ r }: { r: Row }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasDetail = r.before != null || r.after != null || r.metadata != null;
  return (
    <>
      <tr className="border-t border-line hover:bg-surface-muted/50">
        <td className="whitespace-nowrap px-3 py-2 tabular text-ink-muted">{r.time}</td>
        <td className="px-3 py-2">{r.actor}</td>
        <td className="px-3 py-2"><code className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11.5px]" dir="ltr">{r.action}</code></td>
        <td className="px-3 py-2 text-ink-muted">{r.record || "—"}</td>
        <td className="ltr-nums px-3 py-2 text-ink-subtle">{r.ip ?? "—"}</td>
        <td className="px-3 py-2">{hasDetail && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-accent">{t("common.view")} <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} /></button>}</td>
      </tr>
      {open && (
        <tr className="bg-surface-muted/40">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid gap-3 md:grid-cols-3" dir="ltr">
              {[[t("audit.before"), r.before], [t("audit.after"), r.after], ["metadata", r.metadata]].map(([k, v]) => (
                <div key={k as string}><p className="mb-1 text-[11px] font-semibold uppercase text-ink-subtle">{k as string}</p><pre className="max-h-48 overflow-auto rounded bg-surface p-2 text-[11px] scrollbar-thin">{v == null ? "—" : JSON.stringify(v, null, 2)}</pre></div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-ink-subtle" dir="ltr">{r.ua} · hash {r.hash.slice(0, 20)}…</p>
          </td>
        </tr>
      )}
    </>
  );
}

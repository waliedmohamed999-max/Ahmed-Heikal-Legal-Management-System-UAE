"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2, User, Pencil, Mail, Phone, Link2, Contact as ContactIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Picker } from "@/components/picker";
import { useAction, useServerForm } from "@/components/forms";
import { contactSchema, CONTACT_CATEGORIES } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { saveContactAction, addRelationAction } from "../clients/actions";
import { Pager } from "../cases/toolbar";

type Row = {
  id: string; name: string; nameEn: string; nameAr: string | null; category: string; type: string; companyName: string | null; jobTitle: string | null;
  email: string | null; phone: string | null; whatsapp: string | null; address: string | null; notes: string | null; clientId: string | null; client: string | null;
  matters: { id: string; number: string; role: string }[]; relations: { id: string; name: string; label: string; dir: "in" | "out" }[];
};

export function ContactsView({ rows, canManage, focus, total, page }: { rows: Row[]; canManage: boolean; focus: string | null; total: number; page: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(focus ?? rows[0]?.id ?? null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const sel = rows.find((r) => r.id === selected) ?? null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="overflow-hidden rounded-lg border border-line bg-surface lg:col-span-5">
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="text-meta text-ink-muted">{t("common.results", { n: total })}</span>
          {canManage && <Button size="sm" variant="secondary" onClick={() => setEditing("new")}><Plus /> {t("contacts.new")}</Button>}
        </div>
        {rows.length === 0 ? <EmptyState icon={<ContactIcon />} title={t("contacts.empty")} /> : (
          <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto scrollbar-thin">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r.id)} aria-pressed={selected === r.id}
                  className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-surface-muted/60", selected === r.id && "bg-accent-soft/60")}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink-subtle">{r.type === "COMPANY" ? <Building2 className="size-4" /> : <User className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{r.name}</span>
                    <span className="block truncate text-meta text-ink-subtle">{[r.jobTitle, r.companyName, r.client].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  <Badge tone={r.category === "OPPONENT" ? "danger" : r.category === "CLIENT" ? "brand" : "neutral"}>{t(`enums.contactCategory.${r.category}`)}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pager total={total} page={page} pageSize={30} />
      </div>

      <div className="lg:col-span-7">
        {sel ? (
          <div className="space-y-5">
            <Panel title={sel.name} actions={canManage && <Button size="sm" variant="ghost" onClick={() => setEditing(sel)}><Pencil /> {t("common.edit")}</Button>}>
              <div className="grid gap-3 p-4 text-body sm:grid-cols-2">
                {sel.email && <a className="ltr-nums inline-flex items-center gap-1.5 text-ink-muted hover:text-ink" href={`mailto:${sel.email}`}><Mail className="size-3.5" /> {sel.email}</a>}
                {sel.phone && <a className="ltr-nums inline-flex items-center gap-1.5 text-ink-muted hover:text-ink" href={`tel:${sel.phone}`}><Phone className="size-3.5" /> {sel.phone}</a>}
                {sel.address && <p className="text-ink-muted sm:col-span-2">{sel.address}</p>}
                {sel.notes && <p className="whitespace-pre-line text-ink-muted sm:col-span-2">{sel.notes}</p>}
              </div>
              <div className="border-t border-line px-4 py-3">
                <p className="mb-2 text-meta font-semibold text-ink-muted">{t("contacts.linkedMatters")}</p>
                {sel.matters.length === 0 ? <p className="text-meta text-ink-subtle">—</p> : (
                  <div className="flex flex-wrap gap-2">
                    {sel.matters.map((m) => (
                      <Link key={`${m.id}-${m.role}`} href={`/app/cases/${m.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-meta hover:bg-surface-muted">
                        <span className="ltr-nums font-mono">{m.number}</span> <Badge tone="neutral">{t(`enums.partyRole.${m.role}`)}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
            <Panel title={t("contacts.graph")} icon={<Link2 />}>
              <RelationGraph center={sel} />
              {canManage && <AddRelation fromId={sel.id} onDone={() => router.refresh()} />}
            </Panel>
          </div>
        ) : (
          <EmptyState icon={<ContactIcon />} title={t("contacts.empty")} />
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <ContactDialog row={editing === "new" ? null : editing} onDone={() => { setEditing(null); router.refresh(); }} />}
      </Dialog>
    </div>
  );
}

/** Radial relationship graph: contact in the centre, matters and related entities around it. */
function RelationGraph({ center }: { center: Row }) {
  const { t } = useI18n();
  const nodes = [
    ...center.matters.map((m) => ({ key: `m-${m.id}-${m.role}`, label: m.number, sub: t(`enums.partyRole.${m.role}`), href: `/app/cases/${m.id}`, kind: "matter" as const })),
    ...center.relations.map((r) => ({ key: `r-${r.id}-${r.label}`, label: r.name, sub: r.label, href: `/app/contacts?focus=${r.id}`, kind: "contact" as const })),
    ...(center.client ? [{ key: "client", label: center.client, sub: t("enums.contactCategory.CLIENT"), href: `/app/clients/${center.clientId}`, kind: "client" as const }] : []),
  ];
  if (!nodes.length) return <EmptyState compact title="—" />;
  const W = 560, H = 300, cx = W / 2, cy = H / 2, R = Math.min(120, 40 + nodes.length * 14);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("contacts.graph")}>
      {nodes.map((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * R * 1.7, y = cy + Math.sin(a) * R;
        return <line key={`l-${n.key}`} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line-strong)" strokeWidth="1" />;
      })}
      {nodes.map((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * R * 1.7, y = cy + Math.sin(a) * R;
        const color = n.kind === "matter" ? "var(--ev-hearing)" : n.kind === "client" ? "var(--brand)" : "var(--ev-client-meeting)";
        return (
          <a key={n.key} href={n.href}>
            <g>
              <rect x={x - 62} y={y - 17} width="124" height="34" rx="6" fill="var(--surface)" stroke={color} strokeWidth="1.2" />
              <text x={x} y={y - 2} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)">{n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label}</text>
              <text x={x} y={y + 11} textAnchor="middle" fontSize="9.5" fill="var(--ink-subtle)">{n.sub}</text>
            </g>
          </a>
        );
      })}
      <circle cx={cx} cy={cy} r="30" fill="var(--brand)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--brand-fg)">{center.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}</text>
    </svg>
  );
}

function AddRelation({ fromId, onDone }: { fromId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [to, setTo] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const { run, pending } = useAction();
  return (
    <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
      <Picker type="contacts" value={to} onChange={(i) => setTo(i?.id ?? null)} placeholder={t("contacts.relatedTo")} />
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("contacts.relationLabel")} aria-label={t("contacts.relationLabel")} />
      <Button variant="secondary" disabled={!to || !label.trim()} loading={pending} onClick={() => run(() => addRelationAction({ fromId, toId: to!, label }), { onSuccess: () => { setLabel(""); setTo(null); onDone(); } })}>
        <Plus /> {t("contacts.addRelation")}
      </Button>
    </div>
  );
}

function ContactDialog({ row, onDone }: { row: Row | null; onDone: () => void }) {
  const { t } = useI18n();
  const { form, submit, pending, err } = useServerForm({
    schema: contactSchema,
    defaultValues: {
      type: (row?.type as "INDIVIDUAL" | "COMPANY") ?? "INDIVIDUAL", category: (row?.category as never) ?? "OTHER", nameEn: row?.nameEn ?? "", nameAr: row?.nameAr ?? "",
      companyName: row?.companyName ?? "", jobTitle: row?.jobTitle ?? "", email: row?.email ?? "", phone: row?.phone ?? "", whatsapp: row?.whatsapp ?? "",
      address: row?.address ?? "", notes: row?.notes ?? "", clientId: row?.clientId ?? "",
    },
    action: (v) => saveContactAction({ ...v, id: row?.id ?? "" }),
    successMessage: t("contacts.saved"),
    onSuccess: onDone,
  });
  const r = form.register;
  return (
    <DialogContent title={row ? t("contacts.edit") : t("contacts.new")} size="lg">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label={t("contacts.fields.category")}>{(a) => <Select {...a} {...r("category")}>{CONTACT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`enums.contactCategory.${c}`)}</option>)}</Select>}</Field>
        <Field label={t("common.type")}>{(a) => <Select {...a} {...r("type")}><option value="INDIVIDUAL">{t("enums.partyType.INDIVIDUAL")}</option><option value="COMPANY">{t("enums.partyType.COMPANY")}</option></Select>}</Field>
        <Field label={t("clients.fields.nameEn")} error={err("nameEn")} required>{(a) => <Input {...a} dir="ltr" {...r("nameEn")} />}</Field>
        <Field label={t("clients.fields.nameAr")}>{(a) => <Input {...a} dir="rtl" {...r("nameAr")} />}</Field>
        <Field label={t("clients.fields.companyName")}>{(a) => <Input {...a} {...r("companyName")} />}</Field>
        <Field label={t("contacts.fields.jobTitle")}>{(a) => <Input {...a} {...r("jobTitle")} />}</Field>
        <Field label={t("common.email")} error={err("email")}>{(a) => <Input {...a} type="email" dir="ltr" {...r("email")} />}</Field>
        <Field label={t("common.phone")}>{(a) => <Input {...a} type="tel" dir="ltr" {...r("phone")} />}</Field>
        <Field label={t("common.address")} className="sm:col-span-2">{(a) => <Input {...a} {...r("address")} />}</Field>
        <Field label={t("common.notes")} className="sm:col-span-2">{(a) => <Textarea {...a} rows={3} {...r("notes")} />}</Field>
        <DialogFooter className="sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

import { NextResponse } from "next/server";
import { staffRoute } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { auditWhere } from "@/server/services/audit-query";

const esc = (v: unknown) => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Neutralise spreadsheet formula injection and quote CSV fields.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const GET = staffRoute(async (req, ctx) => {
  if (!ctx.can("audit.export")) throw new AppError("forbidden", 403);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await db.auditLog.findMany({ where: auditWhere(ctx.org.id, sp), orderBy: { seq: "asc" }, take: 50_000, include: { actor: { select: { email: true } }, matter: { select: { internalNumber: true } } } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "audit.exported", metadata: { rows: rows.length, filters: sp } });
  const header = ["seq", "time_utc", "actor", "action", "entity_type", "entity_id", "matter", "ip", "user_agent", "before", "after", "metadata", "prev_hash", "hash"];
  const lines = rows.map((r) => [r.seq.toString(), r.createdAt.toISOString(), r.actor?.email, r.action, r.entityType, r.entityId, r.matter?.internalNumber, r.ip, r.userAgent, r.before, r.after, r.metadata, r.prevHash, r.hash].map(esc).join(","));
  return new NextResponse("﻿" + [header.join(","), ...lines].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
});
